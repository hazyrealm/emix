# Emix deployment (getemix.com)

Everything here runs on one VPS (Ubuntu 24.04, `140.235.125.77`). Code lives in
`/opt/emix` (this repo); everything that changes at runtime lives outside it.

| Path | What | In git? |
|---|---|---|
| `/opt/emix` | this repository (`origin` = hazyrealm/emix, `upstream` = TheZwiss/backspace, push disabled) | yes |
| `/srv/emix/prod`, `/srv/emix/staging` | `app.env` (secrets), `livekit.yaml` (secrets), `data/` (SQLite DB, uploads, snapshots), `current-tag`, `previous-tag` | **never** |
| `/srv/emix/edge` | Caddy certificates/state, landing site | never |
| `/etc/emix` | backup destination + restic password | never |
| `/root/emix-admin-*.txt` | initial admin passwords; delete after first login | never |

Host configuration outside Docker (packages, firewall, swap, kernel UDP
buffers, Docker log limits, systemd timers) is recorded in
`deploy/scripts/host-setup.sh`, which rebuilds it on a fresh server.

## Architecture

```
            ┌──────────── emix-caddy (80/443, Let's Encrypt, auto-renew) ────────────┐
 getemix.com│ landing page, /downloads → GitHub releases; www → 301 getemix.com       │
            │ app.getemix.com     → emix-prod-app:3000,    /livekit → 127.0.0.1:7880  │
            │ staging.getemix.com → emix-staging-app:3000, /livekit → 127.0.0.1:7890  │
            │ turn.getemix.com    → only to obtain the TURN/TLS certificate           │
            └─────────────────────────────────────────────────────────────────────────┘
 emix-prod-livekit (host network): 7881/tcp ICE, 50000-60000/udp media,
                                    3478/udp TURN, 5349/tcp TURN/TLS
 emix-staging-livekit (host network): 7891/tcp, 7892/udp (single-port mux)
```

Containers restart automatically (`restart: unless-stopped`; Docker starts on boot).
Firewall (`ufw status`): 22, 80, 443, the LiveKit ports above, and 7880/7890 only
from the Docker network `172.30.0.0/24`. LiveKit's API ports are never public.

DNS (Namecheap, Advanced DNS): A records for `@`, `www`, `app`, `turn`, `staging`
→ `140.235.125.77`. No AAAA (the VPS has no public IPv6).

## Everyday commands (`emixctl`)

```
emixctl status                 # what each environment runs, health
emixctl logs prod [livekit]    # follow logs
emixctl snapshot prod          # manual DB snapshot
emixctl restart-app prod       # after editing /srv/emix/prod/app.env
emixctl edge                   # after editing deploy/edge/Caddyfile
```

## Shipping a change (server / web app)

Nothing reaches production without passing staging first.

1. **Change and commit** (e.g. with Claude Code in `/opt/emix`), then push:
   `git push`. GitHub Actions **CI** runs the build, tests and lint.
2. **Build** an image pinned to that commit (tree must be clean):
   `emixctl build` → `emix:<sha>`
3. **Deploy to staging**: `emixctl deploy staging`
4. **Verify staging**:
   - automated: `deploy/tests/run-staging-checks.sh` (registration gate,
     logins, DMs both ways, LiveKit tokens, and a 60 s two-person Chrome call
     with webcam + mic + 1080p screen share, reporting resolution/fps/loss)
   - by hand at https://staging.getemix.com for anything visual
5. **Promote** the exact image staging runs: `emixctl promote`
   (takes a pre-deploy DB snapshot, records the previous image, checks health
   over HTTPS).

Database migrations run automatically on boot; the app snapshots the DB first
whenever a migration is pending (`data/backups/*-premigration.db`).

## Rolling back

```
emixctl rollback prod        # back to the image prod ran before the last deploy
```

If the bad release migrated the database, the old code may not understand the
new schema. Restore the pre-migration snapshot taken by that deploy:

```
docker stop emix-prod-app
ls -lt /srv/emix/prod/data/backups/          # pick the *-premigration.db (or *-manual.db from the deploy)
cp /srv/emix/prod/data/backups/<file>.db /srv/emix/prod/data/backspace.db
rm -f /srv/emix/prod/data/backspace.db-wal /srv/emix/prod/data/backspace.db-shm
chown 1000:1000 /srv/emix/prod/data/backspace.db
emixctl rollback prod   # or: emixctl restart-app prod if already on the old image
```

Messages sent between that snapshot and the restore are lost, so prefer
fixing forward when the bad release is otherwise usable.

## Backups

- **App snapshots**: every 24 h plus before migrations and deploys, kept in
  `/srv/emix/prod/data/backups/` (same disk).
- **Nightly restic backup** (`emix-backup.timer`, 03:30 UTC): consistent DB
  snapshot + `uploads/` + `app.env` + `livekit.yaml`, encrypted and
  deduplicated, kept 14 daily / 8 weekly / 12 monthly, integrity-checked
  each run. Run now: `systemctl start emix-backup`.
- **Currently the restic repository is on the same disk** (`/var/backups/emix-restic`).
  That protects against mistakes, not against losing the server. To add an
  off-server copy, put the destination in `/etc/emix/backup.env`, e.g. Backblaze B2:

  ```
  RESTIC_REPOSITORY=b2:<bucket>:emix
  RESTIC_PASSWORD_FILE=/etc/emix/restic-password
  B2_ACCOUNT_ID=...
  B2_ACCOUNT_KEY=...
  ```

  then `systemctl start emix-backup`. **Keep a copy of `/etc/emix/restic-password`
  somewhere safe off the server**: without it the backups cannot be decrypted.

### Restore from restic (whole-server loss)

On a fresh server with this repo cloned to `/opt/emix` and Docker installed:

```
deploy/scripts/init-env.sh prod                  # creates dirs (secrets are replaced below)
set -a; . /etc/emix/backup.env; set +a           # recreate this file + password first
restic snapshots --tag emix-prod
restic restore latest --tag emix-prod --target /tmp/r
cp /tmp/r/srv/emix/prod/app.env /tmp/r/srv/emix/prod/livekit.yaml /srv/emix/prod/
cp -a /tmp/r/srv/emix/prod/data/uploads /srv/emix/prod/data/
cp /tmp/r/srv/emix/prod/data/backups/<newest>.db /srv/emix/prod/data/backspace.db
chown -R 1000:1000 /srv/emix/prod/data
emixctl build && echo $(cat /srv/emix/last-build) > /srv/emix/prod/current-tag
emixctl edge && deploy/scripts/sync-turn-cert.sh && emixctl restart-app prod
```

A restore of the latest backup into a throwaway container was tested on
2026-10-16 (admin account and data present).

## Desktop app (Windows)

- Built by `.github/workflows/emix-windows.yml` on GitHub's Windows runners.
- **Test build**: Actions → *Emix Windows* → *Run workflow*. Installers are
  attached to the run as the `emix-windows` artifact. Nothing is published.
- **Release**:
  1. bump `"version"` in `packages/desktop/package.json` (e.g. `1.11.1`), commit,
     push;
  2. `git tag v1.11.1 && git push origin v1.11.1`; the workflow uploads the
     installers and `latest.yml` to a **draft** release;
  3. install the draft's `.exe` on a test machine; then publish the draft on
     GitHub. Installed apps auto-update only from **published** releases.
- The app opens https://app.getemix.com by default. Installers are unsigned, so
  SmartScreen warns on first install ("More info → Run anyway") until a code
  signing certificate is added as GitHub secrets.
- The desktop app loads the web UI from the server, so server/web changes do
  **not** need a new desktop release.

## Admin and accounts

- Admin: `hero` (password initially in `/root/emix-admin-prod.txt`; change it
  in Settings, then `shred -u /root/emix-admin-prod.txt`).
- Registration is **closed**; invite people from the admin panel
  (Instance settings → Invites). Roles, permissions, bans, voice moderation and
  instance-wide screen-share limits are all in the admin/space settings.
- Staging has its own admin `hero` (`/root/emix-admin-staging.txt`) and two
  test accounts used by the checks (`/srv/emix/staging/test-users.json`).

## Merging upstream Backspace updates

```
git fetch upstream
git merge upstream/main          # resolve conflicts; Emix changes are few and listed in EMIX.md
git push
emixctl build && emixctl deploy staging && deploy/tests/run-staging-checks.sh
emixctl promote
```

## Secrets

Never commit `/srv/emix/*/app.env`, `livekit.yaml`, `/etc/emix/*` or the
`/root/emix-admin-*` files. Rotating `JWT_SECRET` logs everyone out; rotating
LiveKit keys requires editing both `app.env` and `livekit.yaml`, then
`emixctl restart-app <env>` and `docker restart emix-<env>-livekit`.
