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
  --file "$outfile"

echo "Backup completed: $outfile"