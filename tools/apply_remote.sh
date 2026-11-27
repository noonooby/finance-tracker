#!/bin/bash
# Run on the server: back up the database, bring a small file into the app, then leave no copy of the file behind.
# The container's temporary folder cannot be written from outside, so the container is recreated to clear it.
# Usage: apply_remote.sh <file in ~/stack> <label> [extra flag]
cd ~/stack || exit 1
NAME="$1"
LABEL="$2"
FLAG="$3"
STAMP=$(date +%Y%m%d-%H%M%S)
for f in finance-data/finance.db finance-data/finance.db-wal finance-data/finance.db-shm; do
  if [ -f "$f" ]; then cp -p "$f" "env-backups/$(basename "$f").$LABEL.$STAMP"; fi
done
docker cp -q "$NAME" stack-finance-1:/tmp/ledger-file.json
truncate -s 0 "$NAME"
mv "$NAME" env-backups/.emptied-ledger-file
docker exec stack-finance-1 sh -c 'E=$(cat /data/export.user); node --experimental-sqlite server/import-history.js /tmp/ledger-file.json "$E" '"$FLAG"' 2>/dev/null'
docker compose up -d --force-recreate --no-deps finance 2>&1 | tail -1
sleep 6
echo "left in the temporary folder: $(docker exec stack-finance-1 ls /tmp | grep -c ledger)"
docker compose ps finance --format "{{.Status}}"
