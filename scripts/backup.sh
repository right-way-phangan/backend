#!/usr/bin/env sh
# Nightly Postgres backup → Google Drive via rclone.
# Setup once:  rclone config   (create a remote named "gdrive")
# Cron (VPS):  0 3 * * *  cd /opt/rightway/backend && ./scripts/backup.sh >> /var/log/rw-backup.log 2>&1
set -eu

STAMP=$(date +%F_%H%M)
OUT="/tmp/rw-${STAMP}.sql.gz"
COMPOSE="docker compose -f docker-compose.vps.yml --env-file .env.vps"

# Dump from the db container (localhost-only Postgres).
$COMPOSE exec -T db pg_dump -U rightway rightway | gzip > "$OUT"

# Upload offsite, then drop the local copy.
rclone copy "$OUT" gdrive:RW-backups/
rm -f "$OUT"

# Retain 30 days on the remote.
rclone delete --min-age 30d gdrive:RW-backups/ || true
echo "backup ok: rw-${STAMP}.sql.gz"
