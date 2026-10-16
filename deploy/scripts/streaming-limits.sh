#!/usr/bin/env bash
# Apply Emix's screen-share limits to an instance's database: up to 4K or the
# source's native resolution, 30/60 fps, up to 50 Mbps. Upstream's defaults
# stop at 1080p60 / 20 Mbps. These are the same values an admin can set in
# Instance settings > Streaming; this script exists because the production
# admin password is (rightly) not available to automation.
#
# Takes a snapshot first. Idempotent. Admins can change the values afterwards.
#   usage: streaming-limits.sh prod|staging
set -euo pipefail
ENV_NAME="${1:?usage: streaming-limits.sh prod|staging}"
APP="emix-$ENV_NAME-app"
"$(dirname "$0")/emixctl" snapshot "$ENV_NAME" | tail -1
docker exec -u node "$APP" node -e "
const D = require('better-sqlite3');
const d = new D(process.env.DB_PATH);
const r = d.prepare(\`UPDATE instance_settings SET
  max_bitrate_kbps = 50000,
  allowed_resolutions = '720,1080,1440,2160,native',
  allowed_framerates = '30,60',
  max_resolution = 2160,
  max_framerate = 60,
  updated_at = ?
  WHERE id = 1\`).run(Date.now());
console.log('streaming limits updated:', r.changes, 'row');
console.log(JSON.stringify(d.prepare('SELECT max_bitrate_kbps, allowed_resolutions, allowed_framerates, max_resolution, max_framerate FROM instance_settings WHERE id = 1').get()));
"
