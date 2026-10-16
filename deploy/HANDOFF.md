# Emix handoff (2026-10-16)

The state of Emix at the end of the setup work: what is done, what is
running, what still needs a person with real hardware, and what is left.
Day-to-day operations are in [README.md](README.md).

## Where everything is

| What | Where |
|---|---|
| Website | https://getemix.com (www redirects here) |
| Web app (production) | https://app.getemix.com |
| Staging | https://staging.getemix.com (separate database, accounts and LiveKit) |
| Windows installer | https://getemix.com/download/windows → latest published GitHub release |
| Source (AGPL-3.0, public) | https://github.com/hazyrealm/emix (`main`), forked from Backspace 1.11.0 |
| Server code | `/opt/emix` on the VPS |
| Live state, not in git | `/srv/emix/{prod,staging}` (`app.env`, `livekit.yaml`, `data/`), `/srv/emix/edge`, `/etc/emix/` |
| Backups | restic repository at `/var/backups/emix-restic` (local disk only, see "Not done") |
| Ops tool | `deploy/scripts/emixctl` (build, deploy staging, promote, rollback, status, snapshot, landing, set-desktop-release) |

Production and staging both run image `emix:3f865660b88c` (Emix 1.11.1).
The only later commit, `29d5d6c1`, bumps four internal helper-script manifests
to 1.11.1 for a CI check and does not change the server or web app.

## What was done

### Server and infrastructure
- Docker, Caddy (automatic HTTPS) and LiveKit (voice/video SFU with built-in
  TURN on 3478/udp and 5349/tcp) are set up for production and staging on one VPS.
- ufw is on (default deny). Only the ports in README.md are open. SSH is unchanged.
- 4 GB swap. Docker log rotation. `live-restore` keeps containers up through Docker restarts.
- Every deploy is a git-commit-tagged image. A deploy snapshots the database
  first, keeps the previous tag for `emixctl rollback`, and checks health over real HTTPS.
- Nightly restic backups at 03:30 cover a consistent SQLite snapshot, uploads
  and config. A restore was tested.
- The TURN certificate syncs daily from Caddy's Let's Encrypt certificate (04:30).
- GitHub Actions on hazyrealm/emix:
  - **active:** CI, CodeQL, Security, Dependabot, Emix Windows
  - **disabled:** upstream-only workflows (Backspace's container publishing,
    landing deploy, metrics, directory hub, telemetry receiver, flatpak, CLA,
    PR triage)

### Privacy and telemetry
- Upstream Backspace has an opt-in "usage ping" to `hello.backspacechat.com`.
  On this production instance it had been **accepted once**, and one ping was
  sent on 2026-10-16. That ping held:
  - a random instance ID, version/commit and "modified" flag
  - whether voice is enabled
  - OS/arch/Node version and the registration mode
  - rounded user counts
  - the server's IP address (visible to the receiver)

  No messages, names, emails or call data were sent.
- Telemetry is now **removed in code**:
  - there is no default endpoint
  - the reporter never starts
  - the admin "enable" API returns `telemetry_unavailable`
  - the consent modal and the admin tab are gone
- The setting was also switched off in the production database.
- The global Backspace space directory (`explore.backspacechat.com`) is
  disabled with `DIRECTORY_ENDPOINT=` (empty) in both `app.env` files.
- The upstream update check is disabled (`BACKSPACE_UPDATE_CHECK=false`).
- No analytics or tracking was added.

**Outbound connections that remain, and why:**

| Connection | Purpose |
|---|---|
| Let's Encrypt (Caddy) | TLS certificates |
| GitHub releases (`hazyrealm/emix`) | Desktop app checks for updates (only from published releases) |
| `raw.githubusercontent.com/hazyrealm/emix/.../games.json` | Desktop game-activity detection list. This is our repo, not upstream. |
| Link previews | The server fetches a URL that a user posts, to show a preview card |
| Federation | Only with peer servers that an admin approves (auto-peering is off) |

### Branding and redesign
- Every icon is generated from the two source images in
  `assets/brand/emix/` by `scripts/emix-icons.py`. This covers the favicon,
  PWA icons, Apple touch icon, desktop `.ico`/`.icns`, tray icons and the
  landing assets. Small sizes (≤48 px) use the "E" tile so it stays legible.
- The colour palette is now violet/pink/cyan. Green remains only for "online"
  and positive text.
- New sign-in and registration screens: a branded panel, a show/hide password
  toggle, a loading spinner and a recovery hint. Invite-only registration is
  unchanged.
- There is a one-time welcome screen after first login (your copy), shown once
  per user per device.
- The Backspace "project hub" (donations, upstream community links) is removed
  from the sidebar, mobile navigation and settings.
- The landing page at getemix.com was redesigned around four messages:
  privacy, quality, freedom and no paywalls.
  - Its product images are real Emix UI captured on **staging** with demo
    accounts (`deploy/tests/demo_seed.py`; Maya, Leo, Sofia, Jordan and Nina
    in the "Studio Nights" space). Their passwords are root-only in
    `/srv/emix/staging/demo-users.json`.
  - The camera feeds are flat illustrations, not real people.
  - On the screen-share image, a test-server "network unstable" banner and
    fps badge were painted out.
- **Attribution kept (required by AGPL):**
  - LICENSE, NOTICE and `EMIX.md` in the repository
  - https://getemix.com/legal/, which has the license, the Backspace
    copyright notice, third-party notices, the source-code link and the
    no-warranty statement
  - In the app:
    - the sign-in pages show a small "Open source & legal" link
    - User Settings shows "Source code (AGPL) · version" plus the same link

### Video and screen sharing
- Settings → Voice & Video → **Camera quality** has these choices:
  - resolution: 720p, 1080p, 1440p or 4K
  - frame rate: 30 or 60 fps
  - quality: Balanced, High or Maximum

  The default is 1080p30 High. The panel shows what your camera **reports it
  can do** and what it is **actually capturing**, and can apply changes to a
  running call.
- Cameras send several quality layers (simulcast). Each viewer receives the
  layer that matches the size their tile is drawn at, and that size accounts
  for the screen's pixel density.
- Screen share has presets for Text, Motion and Quality in Stream Settings.
  The instance limits are now up to 4K or native resolution, 30/60 fps and
  50 Mbps (applied to production and staging).
- The call info popover shows whether the encoder is hardware or software.

### Fixes
- Refreshing the app no longer triggers "Too many requests": static files are
  exempt from the per-IP API rate limit.
- Accepting an incoming call now opens the call view.

## Needs real-world testing (by you)

These were **not** simulated, as you asked. A server without a GPU, cameras or
real networks cannot show real quality.

1. **Sony camera at 4K.**
   - Connect it (USB streaming mode or a capture card).
   - Open Settings → Voice & Video → Camera quality and read the line
     "This camera reports up to …".
   - If it says 1080p, the camera or driver only offers 1080p over that
     connection. Emix cannot raise that, and it does **not** upscale.
   - Pick 4K, start a call and open the connection info popover to see the
     sent resolution, fps and whether encoding is hardware.
2. **Two people on different networks.**
   - Make a video call both ways.
   - Each person shares a screen. A viewer must click **Watch Stream**; this
     opt-in is upstream's design and saves bandwidth.
   - Check picture sharpness when one side is on Wi-Fi or mobile data.
3. **Windows installer.**
   - Install from https://getemix.com/download/windows.
   - SmartScreen will warn because the installer is unsigned: choose
     "More info → Run anyway".
   - Check sign-in, the tray icon, notifications, the start-up option and
     screen-share source picking.
   - After the next release, confirm that auto-update works.
4. **Phones.** Check the login, welcome and chat screens on iOS Safari and
   Android Chrome, plus a call over mobile data.
5. **Several users at once.** Run a group call with 4–6 people. This VPS
   handled a test 4K layer at ~11–19% of one CPU core, but real load depends on
   participants and bitrates.

## Windows release 1.11.1

- Published on 2026-10-16: x64 and arm64 installers plus the `latest.yml`
  auto-update feed. The feed checksum was verified against the x64 installer.
- https://getemix.com/download/windows redirects to the x64 installer.
- During that build, electron-builder's two parallel uploaders each created a
  draft. The files were merged into the published release. **One leftover
  empty draft (holding only a `.blockmap`) is still on GitHub**: delete it on
  the Releases page (it is not public). The workflow now creates the draft
  first, so this will not recur.

## GitHub presentation

- README, screenshots, social preview and logo live in `.github/assets/`.
- The release notes template is `.github/release-notes.md`. The Windows
  workflow fills in the version when it creates a draft; write the "What's
  new" part before publishing.
- **The social preview image has to be uploaded by hand.** GitHub has no API
  for it. Go to https://github.com/hazyrealm/emix/settings → General → Social
  preview → Edit → Upload an image, and upload
  `.github/assets/social-preview.png` (1280×640).
- Private vulnerability reporting is enabled (Security → Advisories).

## Not done / open items

| Item | Why it is open | Suggested next step |
|---|---|---|
| Offsite backups | Backups exist only on this VPS's disk | Add an offsite restic repository (e.g. Backblaze B2 or S3). Keep a copy of `/etc/emix/restic-password` somewhere safe outside the server; without it the backups cannot be read. |
| Code signing | No certificate | Buy an OV/EV code-signing certificate and add it as GitHub Actions secrets. This removes the SmartScreen warning. |
| SSH hardening | Changing SSH needs your approval | Use key-only login (`PasswordAuthentication no`) once your key is confirmed working. Consider fail2ban. |
| macOS/Linux desktop builds | Only Windows was requested | The upstream workflow can be adapted. |
| Production admin API access for automation | You changed the admin password (correct) | Nothing to do. Admin tasks are done in the web UI. |
| Screen-share auto-watch | Upstream requires a click to watch | Could become an Emix option if wanted. |

## Remaining "Backspace" references and why

These are intentional or invisible to users:
- **Legal:** LICENSE, NOTICE, `EMIX.md` and the attribution line, which AGPL
  requires.
- **Internal identifiers that users do not see:**
  - package names `@backspace/*`
  - database file `backspace.db`
  - `localStorage` keys `backspace-*` (renaming them would reset everyone's
    settings)
  - the `backspace://` desktop deep-link scheme
  - environment variable names (`BACKSPACE_*`)
- **Unreachable code kept to ease upstream merges:** the project hub and the
  telemetry/directory components and their translation strings. No route or
  menu leads to them.
- **Upstream documentation** in `docs/` and the flatpak metadata, which is not
  used by Emix.

Renaming the internal identifiers is possible but would make every future
upstream merge conflict-heavy, and the `localStorage` change would reset
user preferences.

## Test status

- Web test suite: 3,304 tests pass. Lint and i18n checks are clean. Server
  typecheck and build pass.
- GitHub CI (lint, typecheck, build, all tests, container build) is the source
  of truth. See the Actions tab.
- Staging API checks (`deploy/tests/api_check.py`) pass. They cover:
  - invite-only registration enforced
  - login works
  - test users are not admins
  - DMs are delivered both ways
  - LiveKit call tokens are issued
- Earlier in-server call tests used fake devices on this VPS, so they prove
  the media stack works, not real quality. The 4K camera layer arrived at
  3840×2160 (~13–14 fps with software encoding and no GPU), with 0% packet loss.
