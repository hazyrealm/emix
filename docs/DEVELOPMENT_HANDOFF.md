# Emix development handoff

**Last updated: 2026-10-17. State: Emix 1.14.0 is in production. No work is in progress.**

This is the starting point for a new session. It describes what Emix is, how it is built and shipped, what is done, what is open, and what to do next. It was checked against the repository, git history and the running servers on the date above.

Related documents (read as needed):

| Document | What it holds |
|---|---|
| `CLAUDE.md` | Permanent instructions. The Emix section at the top overrides the upstream Backspace text below it. |
| `deploy/HANDOFF.md` | Release-by-release history: audits, design notes, deployment records and manual test lists for 1.11–1.14. |
| `deploy/README.md` | Operations: paths, architecture diagram, `emixctl`, rollback, backups, restore, Windows releases, secrets. |
| `EMIX.md` | License and attribution, and what Emix changes from Backspace. |
| `docs/systems/*.md` | Upstream subsystem specs (database, API, WebSocket, voice, auth and so on). They are still accurate for the shared core. |

---

## 1. Project overview

- **What it is.** Emix is a self-hosted chat, voice, video and screen-sharing service, similar to Discord. It runs at https://getemix.com.
- **Where it comes from.** It is a fork of [Backspace](https://github.com/TheZwiss/backspace) 1.11.0 (AGPL-3.0, by Jannis Braun).
- **Owner.** One person runs it on one VPS. Repository: https://github.com/hazyrealm/emix (public, branch `main`).
- **Goals:**
  - privacy (no telemetry or tracking)
  - call quality (up to 4K camera, 60 fps)
  - everything free (no paywalls)
  - a polished UI
- **Current state:**
  - Version 1.14.0 runs on staging and production, both on image `emix:1c3ab67c0ad7`.
  - Production has 3 user accounts.
  - The working tree is clean, `main` is pushed, and CI, CodeQL and Security pass on `a354a05d`.

## 2. Architecture

### Code (pnpm monorepo, TypeScript strict)

| Package | Tech | Notes |
|---|---|---|
| `packages/shared` | TypeScript | Types, permissions, error codes, `changelog.json`, plus Emix modules (`username.ts`, `ringtones.ts`, `theme.ts`, `profileStyle.ts`). Imported as `@backspace/shared/src/...`. |
| `packages/server` | Fastify 4, Drizzle ORM, SQLite (better-sqlite3), JWT | Routes are in `src/routes`. WebSocket code is in `src/ws` (`handler.ts` ConnectionManager, `events.ts`, `presence.ts`). Migrations are in `drizzle/`. |
| `packages/web` | React 18, Vite, Tailwind, Zustand, i18next | Stores are in `src/stores`, audio is in `src/audio/AudioManager.ts`, LiveKit is in `src/hooks/useLiveKit.ts`, and settings panels are in `src/components/modals/settingsPanels`. |
| `packages/desktop` | Electron | A thin shell that **loads https://app.getemix.com remotely**, so web and server changes need no new installer. |

**Internal names stay "backspace".** Package names (`@backspace/*`), `backspace.db`, `localStorage` keys `backspace-*`, `BACKSPACE_*` environment variables and the `backspace://` scheme are all deliberate. Renaming them would reset users' settings and make upstream merges painful.

### Voice and video
- **LiveKit SFU.** Each environment has its own server: prod uses ports 7880/7881, staging uses 7890/7891. TURN runs on 3478/udp and 5349/tcp.
- **Camera.** Simulcast, presets from 720p to 4K at 30/60 fps, and the Balanced/High/Maximum quality levels.
- **Camera effects.** Local canvas processing in `utils/cameraEffects.ts`, done per frame in Chromium. The raw track is sent untouched when all effects are neutral.
- **Microphone chain.** In `AudioManager`, in this order:
  1. browser constraints
  2. an optional RNNoise worklet (`@sapphi-red/web-noise-suppressor`)
  3. an optional 85 Hz high-pass plus a speech gate (`public/worklets/speech-gate.js`)
  4. gain
  5. LiveKit
- **Speaker chain.** Remote audio has per-participant gain, then `masterBoost`, a compressor/limiter and the output. System sounds and ringtones play here only, never into the mic.

### Infrastructure (one VPS, Ubuntu 24.04, 140.235.125.77)

| What | Where |
|---|---|
| Code | `/opt/emix` (this repo). Remotes: `origin` = hazyrealm/emix; `upstream` = TheZwiss/backspace (push disabled). |
| Runtime state (never in git) | `/srv/emix/{prod,staging}/`: `app.env` and `livekit.yaml` (secrets), `data/` (SQLite `backspace.db`, `uploads/`, `ringtones/`, `backups/`), `current-tag`, `previous-tag`. Also `/srv/emix/edge` (Caddy state, landing page) and `/etc/emix` (restic password, backup environment). |
| Containers | `emix-prod-app`, `emix-staging-app`, `emix-prod-livekit`, `emix-staging-livekit`, `emix-caddy` (Caddy 2.11.1, automatic HTTPS) |
| Compose files | `deploy/app/docker-compose.yml`, `deploy/edge/docker-compose.yml`, `deploy/edge/Caddyfile` |
| Timers | `emix-backup.timer` (nightly restic, about 03:30 UTC) and `emix-turn-cert.timer` (about 04:30 UTC). Units are in `deploy/systemd/`. |
| Backups | restic at `/var/backups/emix-restic`, **on the same disk** (no off-server copy yet). App snapshots are in `data/backups/`. |
| Firewall | ufw, default deny. Open ports are listed in `deploy/README.md`. SSH is unchanged. |
| Domains | getemix.com (landing, `/download/windows`, `/changelog`, `/legal/`), app.getemix.com (production), staging.getemix.com, turn.getemix.com (certificate only) |
| GitHub Actions | Active: CI, CodeQL, Security, Dependabot, Emix Windows (`.github/workflows/emix-windows.yml`, runs on `v*` tags or manually). Upstream-only workflows are disabled. |

### Database
- **Engine.** SQLite through Drizzle. The schema is in `packages/server/src/db/schema.ts`, and the upstream spec is `docs/systems/database.md`.
- **Migrations.** There are 35 SQL migrations in `packages/server/drizzle/`. They run automatically on boot, and a `*-premigration.db` snapshot is taken first.
- **Emix migrations:**
  - `0032_emix_profile_changelog`: `users.profile_style` and the What's New acknowledgment.
  - `0033_emix_themes`: `users.app_theme`, plus the `themes` and `theme_likes` tables.
  - `0034_emix_username_ringtones`: `users.username_changed_at`, `users.ringtone_settings`, and the `ringtones` table (cascades with its owner).
- **How to create one.** Run `npx drizzle-kit generate --name emix_<topic>` in `packages/server`, inside the dev container (see §5). Keep migrations additive.

## 3. Completed features (implemented, deployed, verified by automated checks)

Each release's design notes are in `deploy/HANDOFF.md`.

- **Base (1.11.x):**
  - Deployment: prod/staging, Caddy, LiveKit, TURN, backups, `emixctl`
  - Emix branding and redesign, landing page
  - Telemetry removed, upstream directory and update check disabled
  - Camera quality presets up to 4K/60, screen-share presets
  - Windows installer 1.11.1 published
- **1.12.0:**
  - profile customization (name styles, nameplates, decorations, backgrounds, links)
  - camera and mic device menus in the call bar, camera preview before going live
  - local camera effects and mirroring
  - What's New and the changelog pipeline (`scripts/changelog.py`, `emixctl changelog`)
- **1.13.0:**
  - app themes: 12 built-ins, an editor, share links and cards, the community gallery, `.emixtheme` import/export
  - account sync and an emergency reset (Ctrl+Shift+Alt+T, `?resetTheme`)
- **1.14.0:** all eight items in §5 below.

## 4. Recent changes (git)

```
2c25c8ca Handoff: Emix 1.14.0 [skip ci]
a354a05d Backups include uploaded ringtones; staging checks for usernames and ringtones
1c3ab67c Speech gate worklet ships as a static file (src/**/*.js is gitignored)   ← image in prod
608d8273 Emix 1.14.0: ringtones, username changes, status menu, noise suppression levels, stable call video
68bc3855 Handoff: 1.13.0 deployment and Windows draft [skip ci]
3fd46ba6 Emix 1.13.0: app themes
086091b3 Emix 1.12.0: profile customization, call device controls, What's New
```

The 1.14.0 files are listed below. Paths are relative to `packages/`.
- **Shared:** `shared/src/username.ts`, `shared/src/ringtones.ts`, the `activity_state` client event in `types.ts`, and new error codes in `errors.ts`.
- **Server:**
  - new: `routes/username.ts`, `routes/ringtones.ts`, `utils/ringtoneStorage.ts`, `utils/profileRelay.ts`
  - changed: `ws/presence.ts` (`liveStatusFor`, `refreshAutoAway`), `ws/handler.ts` (idle tracking per socket), `ws/events.ts`, `utils/auth.ts` (username read from the DB row), `utils/userDeletion.ts`, migration 0034
  - tests: `routes/username.test.ts`, `routes/ringtones.test.ts`, `ws/autoAway.test.ts`
- **Web:**
  - video: `hooks/useGridLayout.ts`, `VoiceGrid.tsx`, `VoiceUser.tsx`, `StreamTile.tsx`, `PictureInPicture.tsx`, `VoiceControlBar.tsx`, `styles/globals.css` (`.emx-video`, `.glass-over-video`)
  - effects panel: `voice/DeviceControls.tsx` (the `pinned` prop on `AnchoredMenu`)
  - presence: `layout/StatusMenu.tsx`, `ChannelSidebar.tsx`, `utils/autoAway.ts`
  - usernames: `settingsPanels/UsernameSection.tsx`
  - noise suppression: `voice/NoiseSuppressionPicker.tsx` (picker and mic test), `public/worklets/speech-gate.js`, `voiceStore.ts` (levels; persist version 15)
  - ringtones: `stores/ringtoneStore.ts`, `utils/ringtonePlayback.ts` (with a test), `settingsPanels/NotificationsPanel.tsx`, `SoundController.tsx`, `public/sounds/ringtones/*.ogg`
  - volume: `voiceMenuItems.tsx` (Reset)
  - all 5 locales
- **Ops:** `deploy/scripts/backup.sh` now includes `data/ringtones`, and `deploy/tests/feature_check.py` has 28 checks.

## 5. Development priorities: status (latest request, 2026-10-17)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Webcam hover blur, bouncing, tinting | **Completed; needs a real two-device check** | Causes (all fixed): opacity on the tile wrapper with half-pixel offsets, `transition-all`, `backdrop-filter` over the video, Chrome hardware-overlay demotion. Playwright confirmed hover changes neither the tile box nor any ancestor opacity or filter. True visual sharpness can only be judged on real hardware. |
| 2 | Camera Effects panel transparent when scrolled | **Completed; needs a quick manual look** | The preview is pinned and only the controls scroll, in the camera menu and the preview dialog. Playwright checked the preview stays inside the menu after scrolling. Effects code is unchanged. |
| 3 | Username change with 30-day cooldown | **Completed** | 7 server tests (rules, reserved names, cooldown, parallel renames, unique conflict, re-auth) and staging checks pass. Federated or detached accounts cannot rename. |
| 4 | Improved noise suppression | **Completed; needs a real-mic check** | Off/Low/Medium/High, mic test and in-call picker, persisted with a migration. Only one suppressor runs at a time. Krisp-level quality is **not** claimed. |
| 5 | Individual participant volume | **Completed** (it already existed; Reset added) | Local gain only, 0–200 %, remembered, with an output limiter. |
| 6 | Custom incoming and outgoing ringtones | **Completed; needs a two-device check** | Built-ins, uploads (sniffed and re-encoded by ffmpeg), or silent, each with its own volume. Stops on connect or end. DND respects it. 6 server tests, 4 web tests, and a real upload on staging. |
| 7 | Shared ringtones and caller preferences | **Completed; needs a two-device check** | Sharing needs an opt-in switch and is limited to friends or people in a shared DM. "Mine / theirs / none" falls back to your own. Per-friend overrides. |
| 8 | Online / Away / DND, automatic Offline, no Invisible | **Completed** | Status menu in the user panel. Automatic Away is per device and needs every session idle. Manual Away and DND are never overridden. Offline follows a real disconnect after a 5 s grace. 3 server tests and a Playwright check. |

**Verification run for 1.14.0:**
- Server and web typecheck are clean, lint is clean, and the i18n check is clean.
- 3,320 web tests pass, and the new server tests pass.
- Staging `feature_check.py` passes 28/28.
- Playwright on staging passes 13/13.
- GitHub CI passes, including the end-to-end suites.

The manual two-device checklist is in `deploy/HANDOFF.md` → "Emix 1.14.0" → "Manual checks". **The owner has not yet reported results.**

## 6. Outstanding bugs

**Confirmed open bugs: none known.** No bug report is open after 1.14.0.

**Hypotheses and unverified risks:**
- The hover and softness fix relies on Chrome compositor behaviour (`opacity: 0.999` keeps video off the hardware overlay path). This is inferred from Chromium's behaviour and the symptoms. It is not confirmed on the owner's GPU and display. If softness remains with no hover, look at overlay promotion and the GPU driver before touching the WebRTC settings.
- The High noise level's speech gate thresholds were tuned by reasoning, not on real microphones. It may clip soft word endings for quiet speakers. The worklet parameters are in `public/worklets/speech-gate.js`.
- Automatic Away counts activity inside the Emix window only (pointer, keyboard, focus), so watching a video in another app counts as idle. This is by design; system idle detection would need Electron `powerMonitor`.

**Environment limits (not app bugs):**
- The server's `packages/server/src/test/*-e2e` suites spawn `pnpm exec tsx` and fail inside the plain `node:24-slim` dev container (no pnpm). They pass in GitHub CI.

## 7. Remaining features and open items

**From the 1.14 request (left out on purpose):**
- Group calls play your own outgoing ringtone (there is no single "their" ringtone).
- The Settings → Voice & Video camera preview shows the raw camera; the effects preview lives in the camera menu and the preview dialog.

**From 1.13 (left out on purpose):**
- layout density setting
- chat-only wallpapers
- animation-intensity slider

**From 1.12 (left out on purpose):**
- favourite games and badges
- background replacement or real blur (needs a segmentation model)

**Owner actions (not code):**
1. Run the 1.14 manual checklist on two real devices.
2. **Windows:** test the `v1.13.0` **draft** release on a Windows PC, publish it on GitHub, then run `deploy/scripts/emixctl set-desktop-release 1.13.0`. Until then, `/download/windows` serves 1.11.1, which still works, because it loads the web app remotely.
3. **Tidy releases:** delete the stale drafts on GitHub. These are `1.11.1` (an empty draft holding only a `.blockmap`) and the superseded `v1.12.0` draft. Deleting them is destructive, so ask first.
4. **Social preview:** upload `.github/assets/social-preview.png` in the repository settings (GitHub has no API for this).
5. **Registration.** `deploy/HANDOFF.md` says the admin set production registration to **open** on 2026-10-16. `deploy/README.md` still says "closed". Check in Settings → Instance → Registration, and fix whichever document is wrong.
6. **Off-server backups.** Add a restic destination in `/etc/emix/backup.env` (B2 or S3 costs money, so the owner decides). Keep a copy of `/etc/emix/restic-password` off the server.
7. **Optional:**
   - a code-signing certificate (costs money)
   - SSH key-only login and fail2ban (needs approval)
   - macOS and Linux desktop builds
   - a screen-share auto-watch option

**Version note.** `packages/desktop/package.json` is already `1.14.0` (from `scripts/bump-version.mjs`), but no `v1.14.0` tag exists. Pushing a `v1.14.0` tag would build a 1.14.0 installer draft. That is optional, because Electron code did not change.

## 8. Important decisions (keep following them)

1. **Audit before building.** Every request started by checking what already existed (for example, presence, per-participant volume and RNNoise were already there in 1.14). Extend existing code; never write a second implementation.
2. **Preserve the camera stack.** Do not touch resolution, fps, bitrate, simulcast, WebRTC adaptation or the effects pipeline unless asked. Fix rendering issues in CSS and the compositor first.
3. **Everything is free.** No paywalls, tiers or premium flags.
4. **No telemetry, analytics or tracking** without explicit approval. Telemetry was removed in code.
5. **Honest claims.** Never advertise guaranteed 4K, zero compression, end-to-end encryption or Krisp/Discord-grade suppression.
6. **No placeholders.** No button or setting may exist without working.
7. **Presence.** Exactly Online, Away and DND as chosen statuses; **never Invisible or "appear offline"**. Offline only means really disconnected. Automatic Away never overrides a manual choice.
8. **Local-only audio.** Participant volume and ringtones are local only. Ringtones never enter the mic or LiveKit pipeline.
9. **Ringtone uploads.** Sniff the magic bytes, re-encode with ffmpeg, store outside public uploads, serve through an authenticated route with private cache. Sharing is opt-in and limited to friends or people in a shared DM.
10. **Usernames.** Stored lowercase and unique by index. The cooldown is enforced in the same conditional `UPDATE`. Everything references permanent user ids.
11. **Practical testing.** Use focused unit tests, staging API checks (`deploy/tests/feature_check.py`) and a few Playwright checks. **No long simulated multi-browser webcam sessions.** Give the owner a short manual checklist instead.
12. **Upstream compatibility.**
    - Keep internal `backspace` identifiers.
    - Keep changes small so `git merge upstream/main` stays practical.
    - Keep features federation-safe; Emix runs without federation today.
13. **Changelog-driven releases.** Every user-visible release gets a `packages/shared/changelog.json` entry with `"status": "published"`. Bump all package versions with `node scripts/bump-version.mjs <x.y.z>`.
14. **Static worklets.** `packages/web/src/**/*.js` is gitignored, so AudioWorklet files must live in `packages/web/public/worklets/`.

## 9. How to develop, test and deploy

### Dev and test environment
The host has **no Node or pnpm**. Run toolchain commands in a throwaway container that mounts the repo:

```
docker run -d --name emix-dev -v /opt/emix:/src -w /src -e CI=1 node:24-slim sleep infinity
docker exec emix-dev sh -c 'corepack enable >/dev/null 2>&1; cd /src && npx eslint . --max-warnings 0'
docker exec emix-dev sh -c 'cd /src && node scripts/check-i18n.mjs'
docker exec emix-dev sh -c 'cd /src/packages/web && npx tsc --noEmit -p . && npx vitest run'
docker exec emix-dev sh -c 'cd /src/packages/server && npx tsc --noEmit -p . && npx vitest run src'
docker rm -f emix-dev    # when finished
```

- **Translations.** Every user-facing string goes in all 5 locales (`packages/web/src/locales/{en,de,pt,ru,zh}`; `pt` is Brazilian Portuguese). Brand words that stay the same in every language go in `scripts/i18n-allowlist.json`.
- **Playwright.** Install with `pip install playwright==1.48.0` inside `mcr.microsoft.com/playwright/python`. Staging demo users' passwords are root-only in `/srv/emix/staging/demo-users.json`. Never print them.

### Ship a change
Run these from `/opt/emix`, with a clean tree and the commit pushed:

```
deploy/scripts/emixctl build                 # image emix:<sha>
deploy/scripts/emixctl deploy staging
python3 deploy/tests/feature_check.py        # plus deploy/tests/run-staging-checks.sh and a manual look
systemctl start emix-backup.service          # restic backup before production
deploy/scripts/emixctl promote               # snapshot, deploy the staging image to prod, HTTPS health check
deploy/scripts/emixctl status
```

### Rollback
- `emixctl rollback prod` returns to `previous-tag`.
- If the bad release migrated the database, restore the `*-premigration.db` snapshot. The exact steps are in `deploy/README.md` → "Rolling back".

### Windows app
- Push a `vX.Y.Z` tag. `emix-windows.yml` builds the x64 and arm64 installers plus `latest.yml` into a **draft** release, with notes from the changelog.
- Test the draft, publish it, then run `emixctl set-desktop-release X.Y.Z` to repoint `/download/windows`.
- A new installer is needed only when `packages/desktop` changes.

## 10. Known risks

| Risk | Effect | Mitigation |
|---|---|---|
| Backups only on the VPS disk | Losing the server loses all data | Add an off-server restic repository (owner decision, costs money) |
| Losing `/etc/emix/restic-password` | Backups unreadable | Keep an off-server copy |
| Non-additive migrations | Rollback cannot read the newer schema | Keep migrations additive; premigration snapshots exist |
| Restoring a DB snapshot | Loses messages since the snapshot | Prefer fixing forward |
| Rotating `JWT_SECRET` | Logs everyone out | Only rotate deliberately |
| Firewall, SSH or Caddy edits | Could cut off access or take every site down | Don't change networking without approval; `emixctl edge` reloads Caddy |
| Single VPS for prod and staging | Heavy staging tests share CPU with prod | Keep browser tests short |
| Unsigned Windows installer | SmartScreen warning | Code-signing certificate (costs money) |
| Upstream merges | Conflicts in Emix-modified files | Merge on a branch; staging first |
| `localStorage` keys `backspace-*` | Renaming resets every user's settings | Do not rename |

## 11. Safety rules (summary; the full list is in `CLAUDE.md`)

- Ask before destructive operations, production-risky changes, replacing services, exposing services publicly, or anything that costs money.
- Never auto-deploy untested changes to production. Always go through staging and take a backup before production.
- Never reset or overwrite production data. Never change the server's networking or firewall without need. Preserve SSH.
- Never touch other VPSs, Virtualizor nodes or customer infrastructure.
- Never commit, log or ask for secrets (tokens, passwords, keys). Secrets live only in `/srv/emix/*/app.env`, `livekit.yaml` and `/etc/emix`.
- Keep AGPL notices, NOTICE, `EMIX.md`, the `/legal/` page and the in-app source links.
- Don't change existing download URLs. Don't modify unrelated VPS services.

## 12. Exact next steps for the next session

1. Read this file and the top section of `CLAUDE.md`. Run `git -C /opt/emix status` and `deploy/scripts/emixctl status`, and confirm prod and staging still run `emix:1c3ab67c0ad7` (or note what changed).
2. Ask the owner for the results of the 1.14 manual checklist (`deploy/HANDOFF.md` → "Emix 1.14.0" → "Manual checks"). **Fix any reported regressions first**, starting with call video (P1) and noise suppression (P4). Those are the two areas automated tests could not judge.
3. Help with the Windows `v1.13.0` publish when the owner has tested it, then run `emixctl set-desktop-release 1.13.0`.
4. Settle the registration discrepancy (item 5 in §7) and correct the wrong document.
5. Otherwise wait for the owner's next feature request, and start it with an audit (decision 1 in §8).
6. After any release, update this file (status, image tag, next steps) and add a section to `deploy/HANDOFF.md`.
