# Games (Emix 1.15)

A Games hub, Play Together in calls, twelve multiplayer games and a daily word puzzle. Everything is free.

## Model

- **Session.** A private lobby. The host invites people, invitees accept or decline, the host starts a **match**, and after a match players vote for a rematch or the host switches games. A session ends when everyone has left (or it sits idle, see Timers).
- **Server-authoritative.** Every rule runs in `packages/server/src/games/rules/*.ts`. Clients send moves and receive a **per-viewer view**. Hidden information never leaves the server before the rules allow it: Rock Paper Scissors picks, ships, card faces, words, trivia answers and the drawing word. A client never decides an outcome.
- **Ordering.** Turn-based boards send `seq` (the session version they saw). A mismatch returns `409 game_stale` and the client refetches, which protects against duplicate and out-of-order moves. Simultaneous games (Rock Paper Scissors, Word Race, Trivia, Sketch & Guess) use per-rule duplicate checks instead.

## Server

| File | Purpose |
|---|---|
| `games/types.ts` | The `GameRules<S>` interface: `start`, `move`, `deadline`, `timeout`, `view`, `drop`. Rules are pure and take `RuleContext {now, rng}`. |
| `games/registry.ts` | `RULES`: one entry per `GameId`. |
| `games/sessions.ts` | Sessions, invites, start, move, rematch, change game, leave or forfeit, timers, the sweeper, persistence, fan-out and result recording. |
| `games/daily.ts` | The daily word: the answer is a fixed permutation of the answer list, the puzzle number is the number of days since 2026-01-01, and it resets at 00:00 UTC. Also streaks and the guess distribution. |
| `games/stats.ts` | Totals, per-game counts, favourite game and recent matches from `game_results`. |
| `games/words.ts` | Dictionary from `word-list` (MIT, SCOWL-based; server only) plus curated answer lists. |
| `games/triviaBank.ts` | 132 original questions across 6 categories. |
| `games/drawingWords.ts` | 232 drawable nouns. |
| `routes/games.ts` | REST endpoints (below). |
| `utils/reachability.ts` | `canReach` (friends, or a shared open DM), shared with ringtones. |
| `utils/deletionHooks.ts` | Lets account deletion remove the user from live sessions without an import cycle. |

**Who may be invited:**
- friends, or people who share an open DM
- for a `voice` session, anyone in the same call room
- for a `dm` session, members of that DM

At most 7 pending invites per session. Invites expire after 10 minutes. A user can be in at most 6 open sessions (`game_limit_reached`).

**Timers.** One timeout per session, armed at `rules.deadline(state)`; `rules.timeout` runs when it passes. The sweeper runs every 5 s:
- expires invitations
- tracks disconnected players (shown as `away`)
- forfeits a player who has been gone for more than 90 s mid-match (party games drop them instead while at least two players remain)
- closes sessions idle for 30 minutes

**Persistence.** Migration `0035_emix_games` adds:

| Table or column | Holds |
|---|---|
| `game_sessions` | `data` JSON, including the server-only rules state |
| `game_results` | One row per player per match |
| `game_daily` | Each user's daily puzzle |
| `users.show_game_stats` | Whether the profile shows game statistics |

Open sessions are restored on boot (`restoreGameSessions`). Sketch & Guess strokes are kept in memory and saved with the next session change, so a restart can lose the strokes of the current drawing.

### REST (all authenticated)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/games/sessions` | My sessions and invitations. |
| POST | `/api/games/sessions` | `{gameId, options?, context?: {kind:'direct'|'voice'|'dm', dmChannelId?}, invite: userIds}`. The host must be in a call for `voice`. |
| GET | `/api/games/sessions/:id` | |
| GET | `/api/games/sessions/:id/canvas` | Sketch & Guess strokes, for (re)opening. |
| POST | `/api/games/sessions/:id/{invite,accept,decline,leave,start,rematch,game,move}` | `move` takes `{move, seq?}` and allows 600 requests per minute. `game` takes `{gameId, options}` and is host-only. |
| GET | `/api/games/daily` | Today's puzzle. |
| POST | `/api/games/daily/guess` | `{word}` |
| GET | `/api/games/stats/:userId` | `@me` allowed. Returns `{stats: null}` when hidden. |
| PUT | `/api/games/stats/visibility` | `{visible}` |

**Error codes:**
- `game_not_found`, `game_forbidden`, `game_illegal_move`, `game_stale`, `game_not_your_turn`
- `game_full`, `game_not_enough_players`, `game_wrong_state`
- `game_unknown_word`, `game_invite_unreachable`, `game_limit_reached`

### WebSocket

**Server to client:**
- `game_session` `{session}`: the per-viewer view, sent to players and pending invitees on every change
- `game_session_removed` `{sessionId}`
- `game_draw` `{sessionId, op}`

**Client to server:** `game_draw` `{sessionId, op}`. Only the current drawer's strokes are accepted; they are relayed to the other players. `op` is `stroke` (validated colour and size, at most 400 points, a group number for undo), `clear` or `undo`.

## Games and their rules

The full rules are in each rules module's header and in the in-app "How to play" text (`games:catalog.<id>.rules`).

| Game | Players | Notes |
|---|---|---|
| Tic-Tac-Toe | 2 | |
| Connect Four | 2 | |
| Rock Paper Scissors | 2 | Best of 3 or 5, 30 s per round. |
| Chess | 2 | chess.js 1.4 (BSD-2). Clocks: none, 3+2, 5+0, 10+0 or 15+10. Draw offers and resignation. |
| Checkers | 2 | American / English draughts: compulsory capture (any sequence), no flying kings, a man crowned mid-jump stops, and 40 moves each without a capture or crowning is a draw. |
| Battleship | 2 | Fleet 5, 4, 3, 3, 2; ships may touch. 3-minute placement, then a random layout for anyone who hasn't placed. |
| Memory Match | 2 | 16 or 36 cards. |
| Word Race | 2 | Same hidden word, optional 2- or 5-minute timer. |
| Hangman | 2 | Setter-chosen dictionary word or a random one. Roles swap every match. |
| Word Duel | 2 | Original word chain with scoring. |
| Trivia Battle | 2–8 | |
| Sketch & Guess | 2–8 | Original drawing game. |
| Daily Word | solo | Same word for everyone, 00:00 UTC reset. |

Word and trivia content is English (the UI says so in every language).

## Client

| Area | Files |
|---|---|
| State | `stores/gameStore.ts`: sessions, the open window, minimize, the picker, the staged id, per-device preferences (volume, mute, colour-blind). |
| Window and popups | `components/games/GameHost.tsx`, mounted once in AppLayout: the floating window on desktop and full screen on phones, the minimized dock, the new-game dialog, and invitation popups. Do Not Disturb hides the popups; invitations still wait in the hub. |
| Call stage | `components/games/CallGameStage.tsx` wraps `VoiceGrid` in both call views. With a call game open, the game takes the main area and the tiles move to a column (a strip on narrow screens). VoiceGrid keeps its tree position, so video elements are not recreated. |
| Play Together | Buttons in `VoiceControlBar` and `MobileVoiceFullScreen`; a game button in the DM header. |
| Hub | `GamesHubPage.tsx` at `/games` and `/games/daily`; the mobile `games` screen under You → Games. Sidebar entry: `SpaceSidebar` action `games`. |
| Boards | `components/games/boards/*`. |
| Audio | `utils/gameAudio.ts`: `public/sounds/games/*.ogg` (synthesized for Emix) played through `AudioManager.playSound`, the speaker bus only, never the microphone path. The volume is separate from voice and participant volumes. The `game_invite` alert kind is silenced by DND. |
| Profile | `UserProfileModal` Games tab (`ProfileGames.tsx`), shown for accounts on this instance. |
| Locales | The `games` namespace in all 5 locales. |

## Adding a game

1. Add the id and its `GameMeta` (plus options and the view type) in `packages/shared/src/games.ts`.
2. Write a rules module implementing `GameRules` and register it in `games/registry.ts`.
3. Write a board in `components/games/boards/` and add it to the `Board` switch in `GamePanel.tsx`.
4. Add art in `GameArt.tsx`, catalogue keys in `gameCatalog.ts`, and strings in every `locales/*/games.json`.
5. Add rules tests to `games/rules.test.ts`.
