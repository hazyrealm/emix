#!/usr/bin/env bash
# Create /srv/emix/<env> with generated secrets. Idempotent: never overwrites
# an existing app.env or livekit.yaml (re-running cannot rotate live secrets).
#   usage: init-env.sh prod|staging
set -euo pipefail
ENV_NAME="${1:?usage: init-env.sh prod|staging}"
case "$ENV_NAME" in
  prod)    HOST=app.getemix.com ;;
  staging) HOST=staging.getemix.com ;;
  *) echo "unknown env: $ENV_NAME" >&2; exit 1 ;;
esac

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="/srv/emix/$ENV_NAME"
umask 077
mkdir -p "$STATE/data/uploads" "$STATE/certs"

if [[ ! -f "$STATE/livekit.yaml" || ! -f "$STATE/app.env" ]]; then
  LK_KEY="API$(openssl rand -hex 8)"
  LK_SECRET="$(openssl rand -hex 32)"

  sed -e "s/__LIVEKIT_API_KEY__/$LK_KEY/" -e "s/__LIVEKIT_API_SECRET__/$LK_SECRET/" \
    "$REPO/deploy/livekit/$ENV_NAME.yaml.tmpl" > "$STATE/livekit.yaml"

  cat > "$STATE/app.env" <<EOF
# Emix $ENV_NAME runtime config. Secrets: never commit, never paste anywhere.
DOMAIN=$HOST
JWT_SECRET=$(openssl rand -hex 32)
REGISTRATION_OPEN=false
MAX_UPLOAD_SIZE=104857600

LIVEKIT_URL=wss://$HOST/livekit
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET

# AGPL-3.0 section 13 source offer: the public Emix repository.
BACKSPACE_SOURCE_URL=${EMIX_SOURCE_URL:-https://github.com/hazyrealm/emix}

# Never contact the Backspace public space directory.
DIRECTORY_ENDPOINT=

# Emix tracks upstream Backspace through git, not the admin Updates panel.
BACKSPACE_UPDATE_CHECK=false

BACKUP_INTERVAL_HOURS=24
BACKUP_KEEP_SCHEDULED=14
EOF
  echo "created $STATE/app.env and $STATE/livekit.yaml"
else
  echo "$STATE already initialised; left untouched"
fi

# The app container drops to uid 1000; LiveKit reads its config as root.
chown -R 1000:1000 "$STATE/data"
chmod 600 "$STATE/app.env" "$STATE/livekit.yaml"
