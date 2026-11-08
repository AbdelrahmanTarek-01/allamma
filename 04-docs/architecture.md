# Architecture

## Overview
One Node process serves everything: the built React client (static files), a tiny HTTP API, and the Socket.IO server. This fits a single free Render web service.

```
phone browser ──HTTP──▶ NestJS (express) ──▶ client/dist (static, SPA fallback)
              ──WS────▶ Socket.IO gateway ──▶ RoomsService (in-memory rooms + game state)
```

## Server (`03-code/server`)
- **RoomsService** owns all state in memory: `rooms: Map<code, Room>` and `playerRoom: Map<playerId, code>`. Every rule runs here. The client only sends intents.
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
final/result ──host──▶ back to room
```
- **Board:** 12 places shown to everyone: the answer's whole family plus random places from other families.
- **Guess options:** the answer plus 5 others **from the same family**, so the spy's last guess is hard.
- **Spy leaves mid-round:** the round ends as a detectives win.

## Client (`03-code/client`)
- `net.ts`: socket, a tiny external store (`useSyncExternalStore`), `send()` returning acks, toasts, invite links (`/?room=CODE`).
- Screens switch on state: no profile → Onboarding; not connected yet → skeleton; no room → Home; room without game → Room; otherwise the Spy screen for the current phase.
- `index.html` pings `/api/health` before the app loads, so a sleeping free server starts waking while the player is still picking a name.
