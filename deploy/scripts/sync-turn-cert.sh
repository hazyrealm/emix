#!/usr/bin/env bash
# Copy Caddy's certificate for turn.getemix.com to where production LiveKit
# reads it (TURN/TLS on 5349), restarting LiveKit only when it changed.
# Run daily by emix-turn-cert.timer. Until Caddy has issued the real
# certificate, a short-lived self-signed placeholder keeps LiveKit bootable.
set -euo pipefail
HOST=turn.getemix.com
DEST=/srv/emix/prod/certs
SRC_DIR="$(find /srv/emix/edge/caddy-data/caddy/certificates -maxdepth 2 -type d -name "$HOST" 2>/dev/null | head -1 || true)"
mkdir -p "$DEST"

if [[ -z "$SRC_DIR" ]]; then
  if [[ ! -f "$DEST/turn.crt" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=$HOST" \
      -keyout "$DEST/turn.key" -out "$DEST/turn.crt" 2>/dev/null
    chmod 600 "$DEST/turn.key"
    echo "no Caddy cert yet; wrote placeholder"
  fi
  exit 0
fi

if cmp -s "$SRC_DIR/$HOST.crt" "$DEST/turn.crt"; then
  exit 0
fi
install -m 644 "$SRC_DIR/$HOST.crt" "$DEST/turn.crt"
install -m 600 "$SRC_DIR/$HOST.key" "$DEST/turn.key"
echo "TURN certificate updated"
if docker ps --format '{{.Names}}' | grep -qx emix-prod-livekit; then
  docker restart emix-prod-livekit >/dev/null && echo "restarted emix-prod-livekit"
fi
