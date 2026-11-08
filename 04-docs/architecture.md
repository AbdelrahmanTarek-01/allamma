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
discuss ──(timer | someone calls vote)──▶ vote ──(all voted | 45s)──▶ reveal (6s)
reveal ──caught──▶ guess (20s) ──▶ result
reveal ──not caught / tie──▶ result
result ──host next──▶ discuss (next round) | final (after last round)
final ──host──▶ again (new game, same settings) | back to the lounge
result ──host──▶ back to the lounge
```
- **Board:** 12 places shown to everyone: the answer's whole family plus random places from other families.
- **Guess options:** the answer plus 5 others **from the same family**, so the spy's last guess is hard.
- **Spy leaves mid-round:** the round ends as a detectives win.

## Client (`03-code/client`)
- `net.ts`: socket, a tiny external store (`useSyncExternalStore`), `send()` returning acks, toasts, invite links (`/?room=CODE`).
- Screens switch on state: no profile → Onboarding; not connected yet → skeleton; no room → Home; room without a running game → Room (the lounge: name, game picker, settings, players, chat); otherwise the Spy screen for the current phase.
- `index.html` pings `/api/health` before the app loads, so a sleeping free server starts waking while the player is still picking a name.
