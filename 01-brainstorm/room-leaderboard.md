# Room leaderboard ("ترتيب القعدة") — across all games played in one room

- Lives with the room (in memory, same lifetime as the room). Resets only when the room closes or the host resets it.
- Points per finished game, by placement: 1st 10, 2nd 7, 3rd 5, everyone else 2. Team games: every member of the winning team gets 8, losers 2.
- Screen: podium (top 3, crown on 1st) + list for the rest with rank-change arrows since the previous game, small per-game bars, total points.
- Filter tabs: All + one per game type played (shows that game's points only).
- "Games played" strip: game name + winner, newest last.
- Opened from a trophy button in the room header, and shown automatically after every game ends (rank-change animation plays), then "اختار اللعبة الجاية".
- Players who leave keep their row (greyed); rejoin with same playerId restores it.
Design reference: canvas artboard "RoomBoard" (row 2).
