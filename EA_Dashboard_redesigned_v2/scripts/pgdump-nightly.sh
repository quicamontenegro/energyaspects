#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

host_name=$(hostname)
run_output=""

notify() {
  local message="$1"
  if [[ -x "./scripts/notify-telegram-backup.sh" ]]; then
    ./scripts/notify-telegram-backup.sh "$message" HTML || true
  fi
}

cleanup_old_backups() {
  local backup_dir
  backup_dir="${BACKUP_DIR:-$HOME/projects/backups/db}"

  mkdir -p "$backup_dir"

  # Keep only the 14 most recent files for each extension.
  ls -1t "$backup_dir"/supabase_postgres_*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
  ls -1t "$backup_dir"/supabase_postgres_*.sql 2>/dev/null | tail -n +15 | xargs -r rm -f
}

if run_output=$(./scripts/pgdump-supabase.sh 2>&1); then
  cleanup_old_backups

  backup_dir="${BACKUP_DIR:-$HOME/projects/backups/db}"
  latest_file=$(ls -1t "$backup_dir"/supabase_postgres_* 2>/dev/null | head -n 1 || true)
  latest_name=$(basename "$latest_file")
  latest_size=$(du -h "$latest_file" | awk '{print $1}')
  run_time=$(date '+%Y-%m-%d %H:%M:%S')

  message=$(cat <<HTML
<b>DB Backup OK</b>

<b>Server:</b> <code>${host_name}</code>
<b>File:</b> <code>${latest_name}</code>
<b>Size:</b> <code>${latest_size}</code>
<b>Time:</b> <code>${run_time}</code>
HTML
)
  notify "$message"
  printf '%s\n' "$run_output"
else
  status=$?
  run_time=$(date '+%Y-%m-%d %H:%M:%S')
  error_tail=$(printf '%s' "$run_output" | tail -n 5)

  message=$(cat <<HTML
<b>DB Backup FAILED</b>

<b>Server:</b> <code>${host_name}</code>
<b>Exit:</b> <code>${status}</code>
<b>Time:</b> <code>${run_time}</code>
<b>Last output:</b>
<pre>${error_tail}</pre>
HTML
)
  notify "$message"
  printf '%s\n' "$run_output" >&2
  exit "$status"
fi