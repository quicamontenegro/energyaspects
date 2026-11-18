#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SELF_ROOT="$(pwd)"
OTHER_ROOT="${OTHER_PROJECT_DIR:-$HOME/projects/personal-hub}"
HOST_NAME="$(hostname)"
RUN_TIME="$(date '+%Y-%m-%d %H:%M:%S')"
TMP_DIR="$(mktemp -d)"

cleanup_tmp() {
  rm -rf "$TMP_DIR"
}
trap cleanup_tmp EXIT

html_escape() {
  sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

cleanup_old_backups() {
  local backup_dir="$1"
  mkdir -p "$backup_dir"
  ls -1t "$backup_dir"/supabase_postgres_*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
  ls -1t "$backup_dir"/supabase_postgres_*.sql 2>/dev/null | tail -n +15 | xargs -r rm -f
}

run_project_backup() {
  local project_key="$1"
  local project_label="$2"
  local project_root="$3"

  local out=""
  local status="ok"
  local exit_code="0"
  local file_path=""
  local file_path_resolved=""
  local file_name="-"
  local file_size="-"
  local error_tail="-"

  set +e

  if [[ ! -d "$project_root" ]]; then
    status="fail"
    exit_code="2"
    error_tail="Project directory not found: $project_root"
  else
    if out=$(cd "$project_root" && ./scripts/pgdump-supabase.sh 2>&1); then
      file_path=$(printf '%s\n' "$out" | sed -n 's/^Creating backup: //p' | tail -n 1)

      # `pgdump-supabase.sh` may print a relative path (e.g. backups/db/...).
      # Resolve it against the project root so file checks work for both projects.
      if [[ -n "$file_path" ]]; then
        if [[ "$file_path" = /* ]]; then
          file_path_resolved="$file_path"
        else
          file_path_resolved="$project_root/$file_path"
        fi
      fi

      if [[ -n "$file_path_resolved" ]]; then
        cleanup_old_backups "$(dirname "$file_path_resolved")"
      fi

      if [[ -n "$file_path_resolved" && -f "$file_path_resolved" ]]; then
        file_name=$(basename "$file_path_resolved")
        file_size=$(du -h "$file_path_resolved" | awk '{print $1}')
      fi
    else
      status="fail"
      exit_code="$?"
      error_tail=$(printf '%s' "$out" | tail -n 5)
    fi
  fi

  set -e

  {
    printf 'label=%q\n' "$project_label"
    printf 'status=%q\n' "$status"
    printf 'exit_code=%q\n' "$exit_code"
    printf 'file_name=%q\n' "$file_name"
    printf 'file_size=%q\n' "$file_size"
    printf 'error_tail=%q\n' "$(printf '%s' "$error_tail" | html_escape)"
  } > "$TMP_DIR/$project_key.status"
}

if [[ ! -x "$SELF_ROOT/scripts/pgdump-supabase.sh" ]]; then
  echo "Missing executable script: $SELF_ROOT/scripts/pgdump-supabase.sh" >&2
  exit 1
fi

run_project_backup "ea" "EA_Dashboard" "$SELF_ROOT" &
pid_ea=$!
run_project_backup "hub" "personal-hub" "$OTHER_ROOT" &
pid_hub=$!

wait "$pid_ea" || true
wait "$pid_hub" || true

# shellcheck disable=SC1090
source "$TMP_DIR/ea.status"
ea_label="$label"
ea_status="$status"
ea_exit_code="$exit_code"
ea_file_name="$file_name"
ea_file_size="$file_size"
ea_error_tail="$error_tail"

# shellcheck disable=SC1090
source "$TMP_DIR/hub.status"
hub_label="$label"
hub_status="$status"
hub_exit_code="$exit_code"
hub_file_name="$file_name"
hub_file_size="$file_size"
hub_error_tail="$error_tail"

ea_icon="✅"
hub_icon="✅"
if [[ "$ea_status" != "ok" ]]; then ea_icon="❌"; fi
if [[ "$hub_status" != "ok" ]]; then hub_icon="❌"; fi

message=$(cat <<HTML
<b>DB Backup Summary</b>

<b>Server:</b> <code>${HOST_NAME}</code>
<b>Time:</b> <code>${RUN_TIME}</code>

<b>${ea_label}</b> ${ea_icon}
<b>Status:</b> <code>${ea_status}</code>
<b>File:</b> <code>${ea_file_name}</code>
<b>Size:</b> <code>${ea_file_size}</code>
<b>Exit:</b> <code>${ea_exit_code}</code>

<b>${hub_label}</b> ${hub_icon}
<b>Status:</b> <code>${hub_status}</code>
<b>File:</b> <code>${hub_file_name}</code>
<b>Size:</b> <code>${hub_file_size}</code>
<b>Exit:</b> <code>${hub_exit_code}</code>
HTML
)

if [[ "$ea_status" != "ok" ]]; then
  message+=$'\n\n<b>EA_Dashboard error (tail):</b>\n<pre>'"${ea_error_tail}"$'</pre>'
fi

if [[ "$hub_status" != "ok" ]]; then
  message+=$'\n\n<b>personal-hub error (tail):</b>\n<pre>'"${hub_error_tail}"$'</pre>'
fi

notifier_path=""
if [[ -x "$OTHER_ROOT/scripts/notify-telegram-backup.sh" ]]; then
  notifier_path="$OTHER_ROOT/scripts/notify-telegram-backup.sh"
elif [[ -x "$SELF_ROOT/scripts/notify-telegram-backup.sh" ]]; then
  notifier_path="$SELF_ROOT/scripts/notify-telegram-backup.sh"
fi

if [[ -n "$notifier_path" ]]; then
  notifier_dir="$(dirname "$notifier_path")"
  (cd "$notifier_dir/.." && ./scripts/notify-telegram-backup.sh "$message" HTML) || true
fi

if [[ "$ea_status" == "ok" && "$hub_status" == "ok" ]]; then
  echo "Combined backup finished successfully."
  exit 0
fi

echo "Combined backup finished with failures." >&2
exit 1