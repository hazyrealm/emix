#!/usr/bin/env bash
# Verify staging before 'emixctl promote': API checks, then a 60 s two-person
# call (webcam + mic + 1080p screen share both ways) in real Google Chrome.
# Media runs on this server, so it proves the stack works, not real-world quality.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
IMG=mcr.microsoft.com/playwright/python:v1.48.0-noble
SECONDS_IN_CALL="${1:-60}"

echo "==> API checks"
python3 -I "$HERE/api_check.py" "$WORK/state.json"

echo "==> LiveKit client from the running staging image"
tag="$(cat /srv/emix/staging/current-tag)"
f=$(docker run --rm --entrypoint sh "emix:$tag" -c 'ls -d /app/node_modules/.pnpm/livekit-client@*/node_modules/livekit-client/dist/livekit-client.umd.js | head -1')
cid=$(docker create "emix:$tag"); docker cp "$cid:$f" "$WORK/livekit-client.umd.js" >/dev/null; docker rm "$cid" >/dev/null
cp "$HERE/media_call.py" "$WORK/"

echo "==> Two-person call (${SECONDS_IN_CALL}s)"
docker run --rm --network host --ipc=host -v "$WORK:/w:ro" -w /tmp "$IMG" sh -c \
  "pip install -q --break-system-packages playwright==1.48.0 >/dev/null 2>&1 && playwright install chrome >/dev/null 2>&1 && \
   xvfb-run -a -s '-screen 0 1920x1080x24' python /w/media_call.py /w/state.json /w/livekit-client.umd.js $SECONDS_IN_CALL" \
  | grep -E '^==|SENT|RECV'
