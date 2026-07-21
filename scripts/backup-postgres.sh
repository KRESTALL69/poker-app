#!/usr/bin/env bash
# Dumps only the poker_app database out of the shared poker-clock-db
# container (never touches poker_clock's own database inside the same
# instance). Run ON THE VPS: ./scripts/backup-postgres.sh
#
# Note: no equivalent script exists for ReRaise today (audited, none found)
# — this is new, not a copy of an established pattern.
set -Eeuo pipefail

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/poker_app-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

: "${POSTGRES_APP_USER:?Set POSTGRES_APP_USER (the poker_app database user)}"
: "${POSTGRES_APP_DB:?Set POSTGRES_APP_DB (defaults to poker_app)}"
: "${PGPASSWORD:?Set PGPASSWORD (the poker_app role password) so pg_dump can authenticate non-interactively}"

docker exec -e PGPASSWORD="$PGPASSWORD" poker-clock-db pg_dump -U "$POSTGRES_APP_USER" -d "$POSTGRES_APP_DB" \
  | gzip > "$FILE"

echo "Backup written to $FILE"

# Keep the last 14 daily backups, delete older ones.
find "$BACKUP_DIR" -name 'poker_app-*.sql.gz' -mtime +14 -delete
