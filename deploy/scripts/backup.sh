#!/usr/bin/env bash
# Nightly Emix backup (emix-backup.timer). Takes a consistent SQLite snapshot
# through the app, then stores it with uploads and the runtime config in an
# encrypted, deduplicated restic repository.
#
# Destination and secrets live in /etc/emix/backup.env (root-only, never in git):
#   RESTIC_REPOSITORY=/var/backups/emix-restic        # local (default)
#   RESTIC_PASSWORD_FILE=/etc/emix/restic-password
# For off-server copies set RESTIC_REPOSITORY to e.g. s3:/b2:/sftp: plus that
# backend's credentials in the same file. See deploy/README.md.
#   usage: backup.sh [prod|staging]   (default prod)
set -euo pipefail
ENV_NAME="${1:-prod}"
STATE="/srv/emix/$ENV_NAME"
set -a; . /etc/emix/backup.env; set +a

restic cat config >/dev/null 2>&1 || restic init

# Consistent copy of the live database (WAL-safe), written by the app itself.
snap_line="$(/opt/emix/deploy/scripts/emixctl snapshot "$ENV_NAME" | grep 'snapshot written')"
snap="$STATE/data/backups/$(basename "${snap_line##* }")"
[[ -f "$snap" ]] || { echo "backup: snapshot file not found ($snap_line)" >&2; exit 1; }

restic backup --tag "emix-$ENV_NAME" --host emix \
  "$snap" "$STATE/data/uploads" "$STATE/app.env" "$STATE/livekit.yaml" \
  /srv/emix/deploy-history.log \
  --exclude "$STATE/data/uploads/.tus"

restic forget --tag "emix-$ENV_NAME" --host emix \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune --quiet
restic check --quiet
echo "backup of $ENV_NAME complete: $(basename "$snap") + uploads + config"
