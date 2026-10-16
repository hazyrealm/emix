#!/usr/bin/env bash
# Create the instance administrator on an EMPTY instance without ever leaving
# registration open to the public. Backspace makes the first registered user
# the admin; this registers that user over the private Docker network, then
# closes registration again. The generated password goes to a root-only file
# and is never printed.
#   usage: provision-admin.sh prod|staging <username>
set -euo pipefail
ENV_NAME="${1:?usage: provision-admin.sh prod|staging <username>}"
USERNAME="${2:?usage: provision-admin.sh prod|staging <username>}"
STATE="/srv/emix/$ENV_NAME"
APP="emix-$ENV_NAME-app"
CRED="/root/emix-admin-$ENV_NAME.txt"
EMIXCTL="$(dirname "$0")/emixctl"

[[ "$USERNAME" =~ ^[a-z0-9_]+$ ]] || { echo "username: lowercase letters, digits, _ only" >&2; exit 1; }
[[ -f "$STATE/app.env" ]] || { echo "run init-env.sh $ENV_NAME first" >&2; exit 1; }

set_reg() { sed -i "s/^REGISTRATION_OPEN=.*/REGISTRATION_OPEN=$1/" "$STATE/app.env"; }
close_reg() { set_reg false; "$EMIXCTL" restart-app "$ENV_NAME" >/dev/null; }

app_ip() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$APP"; }
api() { curl -fsS -H 'Content-Type: application/json' "http://$(app_ip):3000$1" "${@:2}"; }

# Refuse unless the instance is empty: this script must never mint a second admin path.
users=$(docker exec "$APP" node -e "const D=require('better-sqlite3');const d=new D(process.env.DB_PATH,{readonly:true});console.log(d.prepare('select count(*) c from users').get().c)" 2>/dev/null || echo "?")
[[ "$users" == "0" ]] || { echo "instance has $users user(s); refusing" >&2; exit 1; }

PASSWORD="$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-32)"
trap close_reg EXIT
set_reg true
"$EMIXCTL" restart-app "$ENV_NAME" >/dev/null

resp=$(api /api/auth/register -X POST \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"displayName\":\"$USERNAME\"}")
trap - EXIT
close_reg

if ! grep -qE '"isAdmin":(true|1)' <<<"$resp"; then
  echo "registered, but the account is NOT admin; someone else may have registered first. Investigate before going live." >&2
  exit 1
fi

umask 077
cat > "$CRED" <<EOF
Emix $ENV_NAME administrator
URL:      https://$(grep '^DOMAIN=' "$STATE/app.env" | cut -d= -f2)
Username: $USERNAME
Password: $PASSWORD

Log in, change this password in Settings, then delete this file:
  shred -u $CRED
EOF
echo "admin '$USERNAME' created on $ENV_NAME; credentials in $CRED (root-only). Registration is closed."
