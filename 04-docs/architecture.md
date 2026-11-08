# Architecture

## Overview
One Node process serves everything: the built React client (static files), a tiny HTTP API, and the Socket.IO server. This fits a single free Render web service.

```
phone browser ──HTTP──▶ NestJS (express) ──▶ client/dist (static, SPA fallback)
              ──WS────▶ Socket.IO gateway ──▶ RoomsService (in-memory rooms + game state)
```

## Lounges (قعدة)
A room is a **lounge**: it outlives any single game and can play game after game. It has a name (default "قعدة <host name>", the host can rename it, max 24 chars), a selected game, **settings per game**, and **lounge scores** per player that persist across games.
- Per-game points live in the game engine and start fresh every game. When a game reaches its final screen they are added to the lounge scores once. Leaving a game early (back to the lounge before the final screen) adds nothing.
- After the final screen the host picks `game:again` (same game, same settings, fresh round scores) or `game:backToRoom` (back to the lounge to pick a game).

## Private and public lounges
- **Private** (default): reachable only by code or link. **Public**: listed in the home screen's "قعدات مفتوحة" and used by quick play. The host can switch anytime and can **lock** the lounge so nobody new joins.
- **Bans:** a player the host kicks is added to the room's ban list and can't rejoin that lounge (in memory, gone with the room).
- **Lobby list:** `RoomsService.lobbyList()` builds it on demand: public, unlocked, not full, someone connected. The home screen subscribes with `lobby:list`; the service pushes `lobby:update` when the list changed, throttled to once per second.
- **Quick play** joins the fullest public waiting room with a seat, otherwise creates a new public room.
- **Safety:** `common/profanity.ts` masks bad words (Egyptian Arabic + English) with `***` in player names (always), and in room names and chat while the room is public. Chat is limited to 1 message per second per player. This is a first line of defence: extend the lists as needed.
- **Joining mid-game** is allowed: the newcomer watches and chats, and plays from the next round.

## Chat
In memory only, last 50 messages per room, deleted with the room. It is **not** inside `room:state` (that snapshot is sent on every change, so chat would be resent constantly): the server sends `chat:history` once when a socket enters a room and then one `chat:new` per message. The client keeps its own list (`net.ts`, capped at 50). It is never cleared between rounds or games: the server adds system dividers instead ("بدأت الجولة ٢").

## Server (`03-code/server`)
- **RoomsService** (`rooms/`) owns room concerns only: players, host, kick, chat, settings, lounge scores and lifecycle. State is in memory: `rooms: Map<code, Room>` and `playerRoom: Map<playerId, code>`. It delegates every game action to the room's active engine. The client only sends intents.
- **GameEngine** (`games/game-engine.ts`): the interface a game implements: `start`, `handle(action)`, `onLeave`, `onPresenceChange`, `viewFor(player)`, `scoreOf`, `isOver`, plus `hostActions` (the actions only the host may trigger, enforced by RoomsService). A new engine instance is created per game and gets an `EngineCtx` (the room, `emit`, and the single per-room timer).
- **GameDef + registry** (`games/registry.ts`): each playable game registers its `id`, `minPlayers`, default settings, settings parser and engine factory. `room:selectGame` and `room:settings` read from it. A game that is missing here is "coming soon".
- **Settings schema** (`GameDef.settings`): each game declares its settings as fields (`key`, `label`, `options[]` with an optional `minPlayers` per option). The server validates every `room:settings` change against it (`games/settings.ts`: unknown values ignored, an option that needs more players than are connected is rejected) and sends the schema to the client in `room:state` while in the lounge (`settingsSchema`). The settings sheet and the summary line are rendered generically from it, so a new game only adds a schema. **Rule for every setting: one word or number per option button (`label`); any explanation goes in the group's single small helper line (`hint`).** `full` is only the long form for the read-only summary ("٨ دقايق"). A field with `icon: 'spy'` draws `value` small spy-hat icons under the number. Options with `minPlayers` are faded with a lock until enough players are connected (tapping one shakes it and says what it needs, the selected option never shows a requirement) and their helper line is live: "معاكم ٤ لاعيبة · جاسوسين من ٦ و٣ من ٩".
- **Spy** lives in `games/spy/` (`spy.engine.ts` rules and timers, `spy.types.ts`, `places.ts` pack). To add a game: write an engine, register its def, add its client screens and a tile in `GAMES` (`client/src/components/art.tsx`).
- **RoomsGateway** maps socket events to service calls and acks `{ ok, error? }`. Errors are Arabic messages shown as toasts.
- After every change the service calls `onChange(room)`. The gateway then sends each player a **personalized** `room:state` snapshot (`viewFor`), so secret data (the place, the spy, guess options) only reaches the right phone.
- **Timers** (discussion, vote, reveal, guess) run on the server with one `setTimeout` per room. Clients get `endsAt` plus `serverNow` and render the countdown with a clock offset.
- **Identity:** no accounts. The client creates a UUID once and keeps it in localStorage with name and avatar. On every connect it sends `hello`, and the server re-attaches the socket to the player's room, so refreshing the page or losing the connection keeps you in the game.
- **Host:** the room creator. If they disconnect, host passes to the earliest connected player.
- **Cleanup:** a room with no connected players for 15 minutes is deleted.

### Why in-memory (no Redis yet)
On one free instance, memory is the fastest and simplest store. Rooms are short-lived, so losing them on a restart is acceptable for now. Add Redis (and the Socket.IO Redis adapter) only when running more than one server instance.

## Spy game state machine
```
discuss ──(timer | host starts the vote)──▶ vote ──(all voted | 45s)──▶ reveal (6s)
reveal ──caught──▶ guess (20s) ──▶ result
reveal ──not caught / tie──▶ result
result ──host next──▶ discuss (next round) | final (after last round)
final ──host──▶ again (new game, same settings) | back to the lounge
result ──host──▶ back to the lounge
```
- **Ready to vote:** during the discussion players toggle "ready" (`spy:readyToVote`); the room state shows who is ready and how many connected players there are (disconnected players don't count). Only the host can start the vote (`spy:startVote`, a `hostActions` entry), at any time. Nothing starts when everyone is ready, the host's button just starts pulsing. The timer still starts the vote automatically. Flags reset every round.
- **Spies:** 1-3 per round, limited by connected players (3-5 => 1, 6-8 => up to 2, 9-10 => up to 3). The room's saved setting is never changed; at round start the engine clamps it for that round and posts a system chat message. Spies don't know each other and none sees the place. Voting reveals only the single top-voted player; if that player is a spy only that spy gets the last guess, and every spy not caught gets the escape points. A spy leaving ends the round only when no spy is left or the caught spy left.
- **Difficulty:** every place in `places.ts` is `easy | medium | hard`. The host picks easy / medium / hard / mix (default mix, a random one per round). Points are multiplied (easy x1, medium x1.5, hard x2) and rounded up to 10. Base points: caught spy guessed right 300 (voters then 100 instead of 200), uncaught spy 400, detectives 200 for voting the caught spy / 100 otherwise, nobody caught: detectives who voted for a spy 100.
- **View secrets:** `spyCount`, `difficulty` and `multiplier` are public. `spyIds` is only sent once the round is over, `caughtSpyId` from the reveal on, `guessOptions` only to the caught spy.
- **Board:** 12 places shown to everyone: the answer's whole family plus random places from other families.
- **Guess options:** the answer plus 5 others **from the same family**, so the spy's last guess is hard.
- **Spy leaves mid-round:** the round ends as a detectives win.

## Client (`03-code/client`)
- **How to play:** each game keeps its help in `client/src/games/<game>/help.ts` (idea, steps with icon names, points table, multipliers, tip) and registers it in `games/index.ts`. `components/HelpSheet.tsx` renders it; a small "?" opens it from Home tiles, the lounge's game card and every game screen header. The first time a game starts on a device the sheet opens once (`allamma.helpSeen.<game>` in localStorage).
- `net.ts`: socket, a tiny external store (`useSyncExternalStore`), `send()` returning acks, toasts, invite links (`/?room=CODE`).
- Screens switch on state: no profile → Onboarding; not connected yet → skeleton; no room → Home; room without a running game → Room (the lounge: name, game picker, settings, players, chat); otherwise the Spy screen for the current phase.
- `index.html` pings `/api/health` before the app loads, so a sleeping free server starts waking while the player is still picking a name.

## فين دي؟ (map pin game)
- **Engine:** `server/src/games/map/map.engine.ts`, registered in `games/registry.ts`. Phases: `guess` (timer, ends early when every connected player locked) -> `reveal` (6s + 0.8s per pin) -> `result` (host `next`, or auto after 25s) -> `final`.
- **Secrets (`viewFor`):** the true location, the fact and everyone's pins only exist in the view from `reveal` on. During `guess` a player only gets their own pin, their own hint and the ids of who locked. `map:pin` is not broadcast.
- **Scoring:** haversine km; `round(1000 * exp(-km / scale))` with scale 150 (Egypt) / 400 (Arab world) / 1500 (world); x place difficulty (1 / 1.5 / 2); +50 if locked in the first 5s; -25% with a hint; no pin = 0.
- **Hints:** picked on the server when asked. circle: radius >= 30% of the map's short side (bigger when easy), target 35-75% of the radius from the centre, >= 3 other pack places inside. half: the open side keeps >= 40% of the pack. Hard places: text only. text is the fallback.
- **Places:** `games/map/places/{egypt,arab,world}.ts`, 4 themes each (cities, landmarks, stadiums, dishes). Add a place with `p(name, lat, lon, 'e'|'m'|'h', fact, hint1, hint2, hint3)`.
- **Maps:** `client/scripts/gen-maps.mjs` (`npm run gen:maps` in client, dev dependencies world-atlas + topojson-client + d3-geo) writes `client/src/games/map/maps/{egypt,arab,world}.ts`: SVG markup, projection parameters and the "fit" focus box. The client rebuilds the same d3 projection to turn a tap into lat/lon. Each map is a lazy chunk (`maps.ts`), warmed up while the lounge is open.
- **Client:** `components/MapView.tsx` (pinch / drag / wheel / buttons, camera animation, pins), `screens/MapGame.tsx` (guess, reveal timeline, results ranking animation, final).

## الموجة (wave)
- **Engine:** `server/src/games/wave/wave.engine.ts`, cards in `wave/cards.ts` (`right` is the first word of the pair, 0 degrees is the left pole). Phases of a turn: `clue` (narrator, 75s, else the turn is skipped) -> `guess` (host setting 30/60/90s) -> `call` (teams only, 20s) -> `reveal` (host `next`, or auto after 30s) -> next turn, then `final`. Turns: everyone narrates `rounds` times (teams: the teams alternate).
- **Secrets (`viewFor`):** the target angle only reaches the narrator until the reveal. Solo needles are stored on the server and never broadcast (only who locked). The team needle, the finger dots and the team chat are sent only to the narrator's team (`EngineCtx.emitTo`, flushed at most every 100ms); during the call phase the locked needle is shown to both teams.
- **Scoring:** the target is 24-156 degrees so every zone fits. Zones are 9 degrees wide: centre 4, next 3, outer 2, else 0, times the card's difficulty (1 / 1.5 / 2). Solo: each guesser gets their zone points, the narrator the rounded average of the guessers. Teams: the narrator's team gets the zone points of the shared needle, the other team +1 for a correct left/right call.
- **Teams:** assignments live in the game's settings (`teams`), edited with `room:teams`; missing players are balanced in (`normalizeTeams`). Teams need at least 4 players (`GameDef.validateStart`).
- **Client:** `components/Dial.tsx` (the half-circle, pointer capture, zones, needles, finger dots, reveal cover), `screens/WaveGame.tsx` (narrator, waiting, guess/call for both modes, reveal, final).

## Room leaderboard (ترتيب القعدة)
- **Where:** `Room.board` (`rooms.types.ts`), filled by `RoomsService.recordBoard` when a game reaches its final screen (same moment as the lounge scores, once per game). It lives and dies with the room, and is keyed by playerId so a player who leaves keeps their (greyed) row and gets it back on rejoin.
- **Points:** by placement 10 / 7 / 5 / 2 (ties share the better place). Team games: every member of the winning team 8, the losers 2 (a tie: both teams 8). Engines tell the room who played (`GameEngine.players()`) and, for teams, who won (`teamResult()`).
- **View:** `room.board` = `{ rows (sorted, with total, gain of the last game, prevRank, per-game points, inRoom), played (game, winner, newest last), games }`.
- **Client:** `screens/RoomBoard.tsx`: podium, list with rank-change arrows, filter tabs per game, games-played strip. Opened from the trophy in the lounge header, and by itself ~4s after a game ends, with "اختار اللعبة الجاية" for the host (it sends `game:backToRoom`).
- The older per-player `lounge` sum (raw game points) is still sent and shown as a small chip in the lounge; the board is the placement-based ranking.

## حزّورة (quiz)
- Engine `server/src/games/quiz/quiz.engine.ts`, pack `questions.ts` (61 questions, 6 categories, tiers 1-4). Phases: draft (15 s per pick, 3 categories each) → board (30 s to pick a cell; the picker rotates inside the team) → question (team on turn) → steal (10 s, the wrong option struck) → reveal (7 s, host can skip) → final.
- Difficulty table `QUIZ_LEVELS`: answer time 30/20/15/10 s, 50:50 cards 2/1/1/0, wrong-answer penalty 0/0/50%/100%, and the question tier of the 200/400/600 cells.
- Cards (setting `cards`): ×٢ before picking a cell, ٥٠:٥٠ on the answering team's question, سرقة on the other team's question (they answer first). One treasure (×٢) and one bomb (wrong answer loses the value) hide on the board.
- Teams use `room.settings.quiz.teams` + `normalizeTeams`; `TeamChat` (games/team-chat.ts) keeps one chat per team. Lounge leaderboard: winning team 8, losers 2.

## شبكة الكلمات (words)
- Engine `server/src/games/words/words.engine.ts`, pack `words.ts` (314 words, tiers 1-4, 7 themes). Phases per board: clue (guide) → guess (team) → boardEnd (bomb / win, host can skip) → next board or final match (best of 1/3/5, setting `boards`).
- Difficulty table `WORDS_LEVELS`: words per team 6/7/8/9, neutral 7/5/3/0, bombs 1/1/1/2, bomb loses the board (not on easy), guide time open/90/60/45 s, extra try, secret picks on ماكس, word tiers (hard and max draw from the same few themes).
- Guides rotate every board; the clue is checked against hidden board words (normalised, prefix/suffix). The key is only in the guides' `viewFor`. Lounge points: winners +300, guides +100; room leaderboard 8 / 2.

## Sound pass (01-brainstorm/sounds.md)
- New sfx in `client/src/sound.ts`: near, poof, swipe, boom, blip, coin(step), gavel. `timerTick(left)` (soft tick each second in the last 5 s, rising in the last 3, tiny buzz, "close" at zero) runs on every countdown through `useTimerSounds` (ui.tsx: Timer and the quiz ring). `gameOver(outcome)` = drumroll, fanfare, crown, pop sprinkle, then win/lose for team games.
- Secrecy rule: sounds fire on public events only (same sound for every role and every card until it is flipped). Auction and draw have no screens yet, so coin and gavel are ready but unused.

## مزاد المعلومات (auction)
- Engine `server/src/games/auction/auction.engine.ts`; lots reuse the حزّورة question pack (topic = category, tier from the level). Phases per lot: bid (countdown resets on every bid) → sold (gavel + stamp) → answer (buyer, 15 s; others predict, +50) → reveal → next lot or final. Setting `lots` 5/8/12.
- Difficulty table `AUCTION_LEVELS`: bid time 15/10/8/5 s, start money 1500/1000/800/500, wrong answer refund / half / bid / 2x bid (floored at 0), question tier. Richest wins; money is the lounge score.

## ارسم وخمّن (draw)
- Engine `server/src/games/draw/draw.engine.ts`, pool `draw-words.ts` (316 words, group per level x drawing difficulty 1-3). Phases per round: pick (10 s, 1 of 3 words worth 100/200/300) → draw (live strokes via `ctx.push`) → guess (opens only after submit or draw time) → reveal (8 s) → final with the likes gallery. Setting `cycles` 1/2.
- Difficulty table `DRAW_LEVELS`: draw 90/70/50/40 s, guess 30/20/15/10 s, attempts 4/3/2/2, reveal-letter cards 2/1/1/0, no eraser on ماكس, word pool objects / places and things / situations / feelings and proverbs.
- `EngineCtx.push(ids, event, data)` sends small custom events (not snapshots) through the gateway.

## Shared standings and game over (01-brainstorm/standings-and-game-over.md)
- `components/RoundStandings.tsx`: between rounds, the last 8 seconds of the round-end phase (`useStandingsStep`) show the shared standings (solo rows that re-order with rank arrows, or two team bars), after the game's own result screen; never after the last round. Used by Spy, Map, Wave, Draw, Auction and Words. حزّورة keeps its board (team scores are always on screen). The host's "كمّل دلوقتي" calls the game's own next action.
- Server timers: Spy result now auto-continues after 24 s (host can still skip), Draw reveal 16 s, Auction reveal 14 s (Map 25 s, Wave 30 s and Words 16 s already fit).
- `components/GameOver.tsx` is the final screen of Spy, Map and Wave (podium or cup, two awards, the room-leaderboard line). The room leaderboard opens 9 s after a game ends, or from its link (`allamma:board` event).
