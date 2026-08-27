# ClockLog — a Pomodoro timer and weekly planner
# Copyright (C) 2024  Luca
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Nightly pg_dump with rotation and optional off-site upload via rclone.
# pg_dump's custom format (-Fc) is compressed and supports selective restore.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP="${BACKUP_KEEP:-14}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"

while true; do
  STAMP="$(date -u +%Y%m%d-%H%M%S)"
  FILE="$BACKUP_DIR/clocklog-$STAMP.dump"

  echo "[$(date -u +%FT%TZ)] dumping to $FILE"
  if pg_dump -Fc -f "$FILE"; then
    echo "[$(date -u +%FT%TZ)] dump ok: $(du -h "$FILE" | cut -f1)"

    if [ -n "$REMOTE" ]; then
      if rclone copy "$FILE" "$REMOTE" --log-level INFO; then
        echo "[$(date -u +%FT%TZ)] uploaded to $REMOTE"
      else
        # Upload failure must never lose the local copy or stop the loop.
        echo "[$(date -u +%FT%TZ)] WARN: rclone upload failed, keeping local copy"
      fi
    fi
  else
    echo "[$(date -u +%FT%TZ)] ERROR: pg_dump failed"
  fi

  # Rotate local copies regardless of upload outcome.
  ls -1t "$BACKUP_DIR"/clocklog-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old"
    echo "[$(date -u +%FT%TZ)] rotated out $old"
  done

  sleep "$INTERVAL"
done
