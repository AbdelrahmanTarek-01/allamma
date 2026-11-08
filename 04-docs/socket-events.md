# Socket events

Every client→server event takes a payload and an ack callback. The ack is `{ ok: true, ...data }` or `{ ok: false, error: "<Arabic message>" }`.

## Client → server
| Event | Payload | Who | Notes |
|---|---|---|---|
| `hello` | `{ playerId, name, avatar }` | anyone | Must be first. Ack has `roomCode` if the player is already in a room (reconnect). |
| `room:create` | – | anyone | Ack `{ code }`. Leaves any previous room. |
| `room:join` | `{ code }` | anyone | Max 10 players. |
| `room:leave` | – | member | |
| `room:kick` | `{ playerId }` | host | Removes another player like `room:leave` (mid-game handling included). Not yourself. The kicked player's sockets get `room:kicked`. |
| `room:makeHost` | `{ playerId }` | host | Transfers hosting to another connected player. Not yourself. |
| `room:ready` | `{ ready }` | member | |
| `room:chat` | `{ text }` | member | Up to 200 chars. The last 40 are kept. |
| `room:rename` | `{ name }` | host | Lounge name, trimmed, max 24 chars, not empty. |
| `room:selectGame` | `{ game }` | host | Only in the lounge (no game running). Only `spy` is playable, anything else is rejected with "اللعبة دي جاية قريب". |
| `room:settings` | `{ discussSeconds: 300\|480\|600, rounds: 1\|3\|5 }` | host | Settings of the selected game (shown here: spy). Only while no game is running. Kept per game. |
| `game:start` | – | host | Starts the selected game from the lounge. Needs the game's minimum of connected players (spy: 3). |
| `game:again` | – | host, final screen | Same game, same settings, fresh round scores. |
| `spy:nextTurn` | – | current asker | Passes the question to the next pair. |
| `spy:callVote` | – | round player | Ends discussion now. |
| `spy:vote` | `{ targetId }` | round player | Can change the vote until the tally. |
| `spy:guess` | `{ place }` | spy, guess phase | Must be one of the guess options. |
| `game:next` | – | host, result phase | Next round, or `final` after the last round. |
| `game:backToRoom` | – | host | Ends the game and returns to the lounge to pick a game. Lounge scores stay (a game left before its final screen adds nothing). |

Game events (`spy:*`, `game:next`) are routed by `RoomsService.gameAction` to the room's active engine. Actions an engine lists in `hostActions` (spy: `next`) are host-only.

## Server → client
`room:kicked` (no payload): sent to a player the host removed. The client goes home and shows "المضيف طلّعك من الأوضة".

`room:state` (personalized, after every change):
```ts
{
  code, name /* lounge name */, hostId, youId,
  players: [{ id, name, avatar, ready, connected,
              score /* this game's points, 0 in the lounge */,
              lounge /* lounge total across games */ }],
  chat: [{ id, from, text, at }],
  selectedGame,                       // 'spy'
  settings: { discussSeconds, rounds }, // settings of the selected game
  serverNow,
  game: null | {
    type: 'spy', round, totalRounds,
    phase: 'discuss'|'vote'|'reveal'|'guess'|'result'|'final',
    endsAt, board, participants, askerId, targetId,
    you: null | { isSpy, place /* null for spy until the end */, role },
    votedIds, voteCounts, myVote,
    accusedId, caught,      // from reveal on
    spyId,                  // when caught, or at the end
    guessOptions,           // spy only, guess phase
    place, spyGuess, outcome, roundPoints
  }
}
```

## HTTP
- `GET /api/health` → `{ ok, rooms, players }`. Also used to wake the free server, and by the keep-alive ping.
