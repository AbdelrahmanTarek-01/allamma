# Socket events

Every client→server event takes a payload and an ack callback. The ack is `{ ok: true, ...data }` or `{ ok: false, error: "<Arabic message>" }`.

## Client → server
| Event | Payload | Who | Notes |
|---|---|---|---|
| `hello` | `{ playerId, name, avatar }` | anyone | Must be first. Ack has `roomCode` if the player is already in a room (reconnect). |
| `room:create` | – | anyone | Ack `{ code }`. Leaves any previous room. |
| `room:join` | `{ code }` | anyone | Max 10 players. |
| `room:leave` | – | member | |
| `room:kick` | `{ playerId }` | host | Removes another player like `room:leave` (mid-game handling included) and **bans** them from this lounge: rejoining fails with "المضيف طلّعك من القعدة دي". Not yourself. The kicked player's sockets get `room:kicked`. |
| `room:makeHost` | `{ playerId }` | host | Transfers hosting to another connected player. Not yourself. |
| `room:privacy` | `{ privacy: 'private'\|'public' }` | host | Private (default) = code/link only. Public = listed in the lobby. Can change anytime. |
| `room:lock` | `{ locked }` | host | A locked room rejects new joins with "القعدة مقفولة". Members reconnecting still get in. |
| `lobby:list` | – | anyone | Ack `{ rooms: LobbyRoom[] }` and subscribes the socket to `lobby:update`. Only public, unlocked, not full rooms that someone is in. |
| `lobby:leave` | – | anyone | Unsubscribes from `lobby:update` (home screen closed). |
| `ideas:list` | – | anyone | Home: vote counts for the 7 upcoming game ideas and the ideas this player voted for (`{ counts, mine }`). |
| `ideas:vote` | `{ idea, on }` | anyone | One vote per playerId per idea (`on: false` takes it back). Kept in server memory only. Returns the new `{ counts, mine }`. |
| `lobby:quick` | – | anyone | Joins the fullest public waiting room (now only used by the quick-play button inside the open-rooms screen, no longer on Home) with a free seat (never one that banned you), otherwise creates a new public room. Ack `{ code, created }`. |
| `room:ready` | `{ ready }` | member | |
| `room:chat` | `{ text }` | member | Up to 200 chars. The last 50 messages per room are kept in memory only. Max 1 message per second per player ("استنى ثانية"). Bad words are masked with `***` while the room is public. Delivered to everyone as `chat:new`. |
| `room:difficulty` | `{ level }` | host, lounge only | Shared lounge difficulty: `easy` / `medium` (default) / `hard` / `max`. Only games with a level table (`GameDef.levels`, today Spy) use it; the room view carries `difficulty` and `hasLevels`. |
| `room:rename` | `{ name }` | host | Lounge name, trimmed, max 24 chars, not empty. |
| `room:selectGame` | `{ game }` | host | Only in the lounge (no game running). Only `spy` is playable, anything else is rejected with "اللعبة دي جاية قريب". |
| `room:settings` | a patch of the selected game's settings, e.g. `{ spies: 2 }` | host | Validated against the game's schema (`settingsSchema` in `room:state`): unknown values are ignored, an option that needs more connected players than there are is rejected ("محتاج ٦ لاعيبة"). Only while no game is running. Kept per game. Spy: `discussSeconds` 300/480/600, `rounds` 1/3/5, `spies` 1/2/3 (need 3/6/9 players), `difficulty` easy/medium/hard/mix. |
| `game:start` | – | host | Starts the selected game from the lounge. Needs the game's minimum of connected players (spy: 3). |
| `game:again` | – | host, final screen | Same game, same settings, fresh round scores. |
| `spy:nextTurn` | – | current asker | Passes the question to the next pair. |
| `spy:readyToVote` | `{ ready }` | round player, discussion | Toggles "I'm ready to vote". Only informs the host (`readyToVoteIds` / `readyTotal` in the state); nothing starts by itself when everyone is ready. Flags reset every round; disconnected players are not counted. |
| `spy:startVote` | – | host, discussion | Starts the vote now, even if not everyone is ready. When the discussion timer ends the vote still starts automatically. (Replaces the old `spy:callVote`.) |
| `spy:vote` | `{ targetId }` | round player | Can change the vote until the tally. |
| `spy:guess` | `{ place }` | spy, guess phase | Must be one of the guess options. |
| `map:pin` | `{ lat, lon }` | player, guess phase | فين دي؟: drops/moves your pin. Stored privately on the server (no broadcast), so a time-out can lock it. Rejected while locked. |
| `map:lock` | – | player, guess phase | Locks the pin (needs one). Only the ids of who locked are broadcast. When every connected player locked, the reveal starts at once. |
| `map:unlock` | – | player, guess phase | "Change my mind": unlocks the pin. |
| `map:hint` | – | player, guess phase | Once per place. The server picks the hint type (text / circle / half) by the rules in `01-brainstorm/map-game.md` and sends it to this player only. Costs 25% of this place's points. |
| `room:teams` | `{ op: 'shuffle' }` or `{ op: 'move', playerId }` | host, lounge, الموجة | Edits the two teams (stored with the game's settings; the room view carries `teams` for everyone). |
| `wave:redraw` | – | narrator, clue phase | "كارت تاني": a new card and a new target, once per turn. |
| `wave:clue` | `{ text, voice }` | narrator, clue phase | The typed clue (shown to everyone) or `voice: true` ("قلته بصوتي"). Starts the guess phase. |
| `wave:needle` | `{ angle }` (0-180) | guesser | Solo: stored privately, nothing is broadcast. Teams: the shared needle, sent to the narrator's team only, at most ~10 times a second; moving it clears the team's lock votes. |
| `wave:lock` / `wave:unlock` | `{ angle? }` | guesser | Solo: locks your needle (all locked -> reveal). Teams: your vote to lock; a majority of the connected guessers locks it. |
| `wave:call` | `{ side: 'left' \| 'right' }` | other team, call phase | Teams only: the target is left/right of the needle. Majority of the team; a tie counts as no call. |
| `wave:teamChat` | `{ text }` | team member (not the narrator) | Team-only chat, 1 message per second, last 30 per turn, shown in that team's view only. |
| `game:next` | – | host, result phase | Next round/place, or `final` after the last one. (فين دي؟ also moves on by itself 25s after the results.) |
| `game:backToRoom` | – | host | Ends the game and returns to the lounge to pick a game. Lounge scores stay (a game left before its final screen adds nothing). |

Game events (`spy:*`, `game:next`) are routed by `RoomsService.gameAction` to the room's active engine. Actions an engine lists in `hostActions` (spy: `next`, `startVote`; map: `next`) are host-only. The room view also carries `minPlayers` of the selected game (spy 3, map 2).

## Server → client
**Chat is not part of `room:state`.** The server sends the history once when a socket enters a room (after `hello` finds the player already in a room, and after `room:create`, `room:join`, `lobby:quick`), then pushes each new message on its own. The client keeps its own list, capped at 50.
- `chat:history` (`ChatMsg[]`, up to 50): replaces the client's list.
- `chat:new` (`ChatMsg`): append.
```ts
ChatMsg = { id, from /* player id, '' for system */, text, at, system?: true }
```
Chat is never cleared between rounds or games. Instead the server adds a **system message** (`system: true`) when a game starts ("بدأت لعبة مين الجاسوس؟") and when a later round starts ("بدأت الجولة ٢"). Clients show these centered and muted. Everything is deleted with the room.

`lobby:update` (`LobbyRoom[]`): pushed to sockets subscribed through `lobby:list`, at most once per second and only when the list changed.
```ts
LobbyRoom = { code, name, host: { name, avatar }, game, players, max, status: 'waiting' | 'playing' }
```

`room:kicked` (no payload): sent to a player the host removed. The client goes home and shows "المضيف طلّعك من الأوضة".

`room:state` (personalized, after every change):
```ts
{
  code, name /* lounge name, bad words masked while public */,
  privacy /* 'private' | 'public' */, locked,
  hostId, youId,
  players: [{ id, name, avatar, ready, connected,
              score /* this game's points, 0 in the lounge */,
              lounge /* lounge total across games */ }],
  selectedGame,                       // 'spy'
  settings: { discussSeconds, rounds, spies, difficulty }, // settings of the selected game
  settingsSchema,                    // [{ key, label, hint?, icon?, options: [{ value, label, full?, hintName?, minPlayers? }] }], null during a game
  serverNow,
  game: null | {
    type: 'spy', round, totalRounds,
    phase: 'discuss'|'vote'|'reveal'|'guess'|'result'|'final',
    endsAt, board, participants, askerId, targetId,
    you: null | { isSpy, place /* null for spy until the end */, role },
    votedIds, voteCounts, myVote,
    readyToVoteIds, readyTotal,         // discussion: connected players who are ready to vote, and how many connected players there are
    spyCount, difficulty, multiplier,   // public: how many spies, this round's difficulty ('easy'|'medium'|'hard') and points multiplier
    accusedId, caught,      // from reveal on: the single top-voted player, and whether they are a spy
    caughtSpyId,            // the caught spy, from reveal on
    spyIds,                 // every spy, only once the round is over (null before)
    guessOptions,           // only the caught spy, guess phase
    place, spyGuess, outcome, roundPoints
  }
}
```

## Join approval
- `room:joinMode { mode: 'open'|'ask'|'locked' }` (host only; replaces `room:lock`). In ask mode `room:join` from a new player (list, code or link) answers `{ ok, code, pending: { until, roomName, hostName } }` and the request waits up to 60 s; players already in the room rejoin directly. At most 10 requests per room, one per player; a mode change or a full room drops them.
- Host answers with `room:request { id, accept }`; the room snapshot carries `requests[]` (host only: `{ id, name, avatar, returning }`). The requester gets `join:result { code, status }` (`accepted | rejected | expired | full | closed`) and can send `room:requestCancel`. A rejected player can't ask the same room again for 2 minutes (`REJECTED`). Quick play never picks ask rooms. `lobby:list` rows add `avatars[4]`, `ask`, `difficulty`.

## Room capacity
- `room:maxPlayers { max: 4|6|8|12 }` (host only; default 8). Rejected below the current player count or the selected game's minimum. Joining by code, link or quick play fails with `{ ok:false, code:'ROOM_FULL', error:'القعدة مليانة' }` at the cap; a player already in the room can always rejoin. `lobby:list` rows carry `players`, `max` and `full`; `lobby:quick` skips full rooms and never creates one (`NO_ROOMS`).

## Team games (حزّورة and شبكة الكلمات)
One generic event: `game:act` with `{ game: 'quiz' | 'words' | 'auction' | 'draw', action, payload }`, ack `{ ok, error? }`. The engine validates the actor, the phase and the payload.
- quiz actions: `pickCategory {cat}`, `pickCell {r,c}`, `card {card: 'double'|'fifty'|'steal'}`, `vote {option}`, `lock`, `teamChat {text}`, `next` (host).
- words actions: `clue {word,num}`, `mark {i}`, `flip`, `endTurn`, `teamChat {text}`, `next` (host).
- auction actions: `bid {step: 50|100|200}`, `pick {option}` (buyer), `lock` (buyer), `predict {yes}` (everyone else), `next` (host).
- draw actions: `pickWord {i}`, `strokeStart {id,c,w}`, `strokePts {id,pts}`, `undo`, `clear`, `submit` (drawer), `guess {text}`, `hint`, `like {round}` (final), `next` (host). Live strokes reach the guessers as the `draw:delta` event `{ round, base, rev, ops }` (applied only when `base` matches the local revision; the next snapshot repairs a gap).
- Teams are edited with `room:teams` (shuffle / move), the same editor as الموجة teams mode.
- Secrets: words' colour key only to the two guides (everyone sees a card's colour when it is flipped); marks only to the marking team (on ماكس not even there). draw: the word only to the drawer until the reveal, a hint letter only to its owner, "قريب!" only to the guesser, guessing closed until the drawing is submitted. auction: the question only exists in snapshots once the lot is sold, the buyer's pick is private until locked. quiz: the right answer only at the reveal; teammates' votes only to the answering team; a team's chat only to that team.

## HTTP
- `GET /api/health` → `{ ok, rooms, players }`. Also used to wake the free server, and by the keep-alive ping.
