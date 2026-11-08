# Socket events

Every client→server event takes a payload and an ack callback. The ack is `{ ok: true, ...data }` or `{ ok: false, error: "<Arabic message>" }`.

## Client → server
| Event | Payload | Who | Notes |
|---|---|---|---|
| `hello` | `{ playerId, name, avatar }` | anyone | Must be first. Ack has `roomCode` if the player is already in a room (reconnect). |
| `room:create` | – | anyone | Ack `{ code }`. Leaves any previous room. |
| `room:join` | `{ code }` | anyone | Max 10 players. |
| `room:leave` | – | member | |
| `room:ready` | `{ ready }` | member | |
| `room:chat` | `{ text }` | member | Up to 200 chars. The last 40 are kept. |
| `room:settings` | `{ discussSeconds: 300\|480\|600, rounds: 1\|3\|5 }` | host | Only while no game is running. |
| `game:start` | – | host | Needs 3+ connected players. Resets scores. |
| `spy:nextTurn` | – | current asker | Passes the question to the next pair. |
| `spy:callVote` | – | round player | Ends discussion now. |
| `spy:vote` | `{ targetId }` | round player | Can change the vote until the tally. |
| `spy:guess` | `{ place }` | spy, guess phase | Must be one of the guess options. |
| `game:next` | – | host, result phase | Next round, or `final` after the last round. |
| `game:backToRoom` | – | host | Ends the game. |

## Server → client
`room:state` (personalized, after every change):
```ts
{
  code, hostId, youId,
  players: [{ id, name, avatar, ready, connected, score }],
  chat: [{ id, from, text, at }],
  settings: { discussSeconds, rounds },
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
