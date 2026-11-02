#!/usr/bin/env bash
set -euo pipefail

# Load optional local env file with DB variables.
if [[ -f ".env.pgdump" ]]; then
  # shellcheck disable=SC1091
  source ".env.pgdump"
fi

required_vars=(SUPABASE_DB_HOST SUPABASE_DB_PASSWORD)
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required variable: ${var_name}" >&2
    echo "Set it in your shell or in .env.pgdump" >&2
    exit 1
  fi
done

DB_PORT="${SUPABASE_DB_PORT:-5432}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/projects/backups/db}"
MONTHLY_BACKUP_DIR="${MONTHLY_BACKUP_DIR:-${BACKUP_DIR%/}-monthly}"
NAS_MOUNT_ROOT="${NAS_MOUNT_ROOT:-/mnt/nas_db_backups}"
NAS_BACKUP_ROOT="${NAS_BACKUP_ROOT:-}"
DAILY_BACKUP_KEEP=7
MONTHLY_START_LAST_DAY=7
MONTHLY_END_FIRST_DAY=25
PROJECT_SUFFIX_RAW="${DUMP_PROJECT_SUFFIX:-$(basename "$(pwd)")}"

# Normalize suffix to lowercase snake_case for filesystem-safe names.
PROJECT_SUFFIX="$(printf '%s' "$PROJECT_SUFFIX_RAW" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')"

mkdir -p "$BACKUP_DIR"

timestamp="$(date +"%Y-%m-%d_%H-%M-%S")"

format="custom"
ext="dump"

if [[ "${1:-}" == "--plain" ]]; then
  format="plain"
  ext="sql"
fi

suffix_part=""
if [[ -n "$PROJECT_SUFFIX" ]]; then
  suffix_part="_${PROJECT_SUFFIX}"
fi

outfile="$BACKUP_DIR/supabase_${DB_NAME}_${timestamp}${suffix_part}.${ext}"
outfile_tmp="${outfile}.tmp.$$"
monthly_tmp=""
nas_outfile_tmp=""
nas_monthly_tmp=""
nas_prune_tmp=""

cleanup_tmp() {
  if [[ -n "$outfile_tmp" ]]; then
    rm -f -- "$outfile_tmp" || true
  fi
  if [[ -n "$monthly_tmp" ]]; then
    rm -f -- "$monthly_tmp" || true
  fi
  if [[ -n "$nas_outfile_tmp" ]]; then
    timeout --kill-after=5s 10s rm -f -- "$nas_outfile_tmp" || true
  fi
  if [[ -n "$nas_monthly_tmp" ]]; then
    timeout --kill-after=5s 10s rm -f -- "$nas_monthly_tmp" || true
  fi
  if [[ -n "$nas_prune_tmp" ]]; then
    rm -f -- "$nas_prune_tmp" || true
  fi
  return 0
}
trap cleanup_tmp EXIT

echo "Creating backup: $outfile"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

pg_dump \
  --host "$SUPABASE_DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --format "$format" \
  --no-owner \
  --no-privileges \
  --file "$outfile_tmp"

if [[ ! -s "$outfile_tmp" ]]; then
  echo "ERROR: pg_dump produced an empty backup; refusing to publish it." >&2
  exit 1
fi

if [[ "$format" == "custom" ]] && ! pg_restore --list "$outfile_tmp" >/dev/null; then
  echo "ERROR: pg_restore could not read the generated backup; refusing to publish it." >&2
  exit 1
fi

mv -f -- "$outfile_tmp" "$outfile"
outfile_tmp=""

echo "Backup completed: $outfile"

monthly_key="$(date +"%Y-%m")"
day_of_month=$((10#$(date +"%d")))
monthly_slot=""
if (( day_of_month <= MONTHLY_START_LAST_DAY )); then
  monthly_slot="start"
elif (( day_of_month >= MONTHLY_END_FIRST_DAY )); then
  monthly_slot="end"
fi

monthly_outfile=""
if [[ -n "$monthly_slot" ]]; then
  monthly_outfile="$MONTHLY_BACKUP_DIR/supabase_${DB_NAME}_${monthly_key}_${monthly_slot}${suffix_part}.${ext}"
  mkdir -p "$MONTHLY_BACKUP_DIR"
  if [[ "$monthly_slot" == "start" && -s "$monthly_outfile" ]] && \
    { [[ "$format" != "custom" ]] || pg_restore --list "$monthly_outfile" >/dev/null 2>&1; }; then
    echo "Monthly start snapshot preserved: $monthly_outfile"
  else
    monthly_tmp="${monthly_outfile}.tmp.$$"
    cp -- "$outfile" "$monthly_tmp"
    if [[ ! -s "$monthly_tmp" ]]; then
      echo "ERROR: monthly backup copy is empty; refusing to publish it." >&2
      exit 1
    fi
    if [[ "$format" == "custom" ]] && ! pg_restore --list "$monthly_tmp" >/dev/null; then
      echo "ERROR: pg_restore could not read the monthly backup copy." >&2
      exit 1
    fi
    mv -f -- "$monthly_tmp" "$monthly_outfile"
    monthly_tmp=""
    echo "Monthly $monthly_slot snapshot updated: $monthly_outfile"
  fi
else
  echo "No monthly snapshot window today; existing start/end snapshots are unchanged."
fi

for cleanup_ext in dump sql; do
  while IFS= read -r old_backup_name; do
    [[ -n "$old_backup_name" ]] || continue
    rm -f -- "$BACKUP_DIR/$old_backup_name"
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "supabase_${DB_NAME}_*${suffix_part}.${cleanup_ext}" -printf '%f\n' | sort -r | awk -v keep="$DAILY_BACKUP_KEEP" 'NR > keep')
done
echo "Local daily retention applied: kept up to $DAILY_BACKUP_KEEP backups per format."

if [[ -z "$NAS_BACKUP_ROOT" ]]; then
  echo "NAS copy skipped: NAS_BACKUP_ROOT is not configured."
else
  if ! timeout --kill-after=5s 20s stat -L "$NAS_MOUNT_ROOT" >/dev/null 2>&1; then
    echo "ERROR: NAS backup mount is unavailable; local backup is retained." >&2
    exit 1
  fi
  nas_fs_types="$(timeout --kill-after=5s 10s findmnt -rn -T "$NAS_MOUNT_ROOT" -o FSTYPE 2>/dev/null || true)"
  if ! grep -qx 'cifs' <<< "$nas_fs_types"; then
    echo "ERROR: NAS backup path is not on CIFS; local backup is retained." >&2
    exit 1
  fi

  nas_daily_dir="$NAS_BACKUP_ROOT/$PROJECT_SUFFIX/daily"
  nas_monthly_dir="$NAS_BACKUP_ROOT/$PROJECT_SUFFIX/monthly"
  if ! timeout --kill-after=5s 30s mkdir -p -- "$nas_daily_dir" "$nas_monthly_dir"; then
    echo "ERROR: could not create NAS backup directories; local backup is retained." >&2
    exit 1
  fi

  nas_outfile="$nas_daily_dir/$(basename "$outfile")"
  nas_outfile_tmp="${nas_outfile}.tmp.$$"
  if ! timeout --kill-after=5s 120s cp -- "$outfile" "$nas_outfile_tmp"; then
    echo "ERROR: could not copy daily backup to NAS; local backup is retained." >&2
    exit 1
  fi
  if [[ ! -s "$nas_outfile_tmp" ]] || ! timeout --kill-after=5s 30s cmp -s -- "$outfile" "$nas_outfile_tmp"; then
    echo "ERROR: NAS daily backup copy is incomplete; local backup is retained." >&2
    exit 1
  fi
  if [[ "$format" == "custom" ]] && ! timeout --kill-after=5s 30s pg_restore --list "$nas_outfile_tmp" >/dev/null; then
    echo "ERROR: NAS daily backup copy failed pg_restore validation." >&2
    exit 1
  fi
  if ! timeout --kill-after=5s 30s mv -f -- "$nas_outfile_tmp" "$nas_outfile"; then
    echo "ERROR: could not publish daily backup on NAS; local backup is retained." >&2
    exit 1
  fi
  nas_outfile_tmp=""
  echo "NAS daily backup verified: $nas_outfile"

  if [[ -n "$monthly_outfile" ]]; then
    nas_monthly_outfile="$nas_monthly_dir/$(basename "$monthly_outfile")"
    nas_monthly_tmp="${nas_monthly_outfile}.tmp.$$"
    if ! timeout --kill-after=5s 120s cp -- "$monthly_outfile" "$nas_monthly_tmp"; then
      echo "ERROR: could not copy monthly backup to NAS; local backup is retained." >&2
      exit 1
    fi
    if [[ ! -s "$nas_monthly_tmp" ]] || ! timeout --kill-after=5s 30s cmp -s -- "$monthly_outfile" "$nas_monthly_tmp"; then
      echo "ERROR: NAS monthly backup copy is incomplete; local backup is retained." >&2
      exit 1
    fi
    if [[ "$format" == "custom" ]] && ! timeout --kill-after=5s 30s pg_restore --list "$nas_monthly_tmp" >/dev/null; then
      echo "ERROR: NAS monthly backup copy failed pg_restore validation." >&2
      exit 1
    fi
    if ! timeout --kill-after=5s 30s mv -f -- "$nas_monthly_tmp" "$nas_monthly_outfile"; then
      echo "ERROR: could not publish monthly backup on NAS; local backup is retained." >&2
      exit 1
    fi
    nas_monthly_tmp=""
    echo "NAS monthly $monthly_slot snapshot verified: $nas_monthly_outfile"
  fi

  for cleanup_ext in dump sql; do
    nas_prune_tmp="$(mktemp /tmp/supabase-nas-prune.XXXXXX)"
    cleanup_pattern="supabase_${DB_NAME}_*${suffix_part}.${cleanup_ext}"
    if ! timeout --kill-after=5s 30s find "$nas_daily_dir" -maxdepth 1 -type f -name "$cleanup_pattern" -printf '%f\n' > "$nas_prune_tmp"; then
      echo "ERROR: could not list NAS daily backups for retention; verified backups remain intact." >&2
      exit 1
    fi
    while IFS= read -r old_backup_name; do
      [[ -n "$old_backup_name" ]] || continue
      old_backup="$nas_daily_dir/$old_backup_name"
      if ! timeout --kill-after=5s 30s rm -f -- "$old_backup"; then
        echo "ERROR: could not prune old NAS backup '$old_backup'." >&2
        exit 1
      fi
    done < <(sort -r "$nas_prune_tmp" | awk -v keep="$DAILY_BACKUP_KEEP" 'NR > keep')
    rm -f -- "$nas_prune_tmp"
    nas_prune_tmp=""
  done
  echo "NAS daily retention applied: kept up to $DAILY_BACKUP_KEEP dumps per format."
fi

if [[ "$monthly_slot" == "end" ]]; then
  legacy_monthly_outfile="$MONTHLY_BACKUP_DIR/supabase_${DB_NAME}_${monthly_key}${suffix_part}.${ext}"
  if [[ -e "$legacy_monthly_outfile" ]]; then
    rm -f -- "$legacy_monthly_outfile"
    echo "Removed superseded legacy monthly snapshot: $legacy_monthly_outfile"
  fi
  if [[ -n "$NAS_BACKUP_ROOT" ]]; then
    legacy_nas_monthly="$nas_monthly_dir/$(basename "$legacy_monthly_outfile")"
    if timeout --kill-after=5s 30s test -e "$legacy_nas_monthly"; then
      timeout --kill-after=5s 30s rm -f -- "$legacy_nas_monthly"
      echo "Removed superseded NAS monthly snapshot: $legacy_nas_monthly"
    fi
  fi
fi
