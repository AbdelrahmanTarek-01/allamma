# Between-rounds standings + game over — shared by ALL games

Two shared screens, one component each, themed per game (accent colour, name, highlight text, awards). Design: 02-design/canvas/RoundStandings.dc.html and GameOver.dc.html (tweak `game` shows each variant).

Between rounds (after every round/lot/board until the last):
- Game chip + "الترتيب بعد جولة N من M" + progress segments (filled = played).
- One-line highlight of the round (game-specific, e.g. spy: who the spy was).
- Solo games: rows with this round's gain (+), animated totals, re-ordering, rank change (▲ طلع / ▼ نزل); "إنت" row highlighted.
- Team games (quiz, words): two team bars with gain and members.
- Auto-continue countdown 8s; host can press "كمّل دلوقتي".
- Games that already have a custom round-end screen (Spy results, Geo results, Draw round end, Words board end) show it first, then this standings screen.

Game over (after the configured number of rounds):
- Solo: podium top 3 with crown + 4th/5th strip. Team: cup + winning team + score.
- 2 game-specific awards. Line showing room-leaderboard points earned + link to "ترتيب القعدة".
- Buttons: "نلعبها تاني" (same settings) / "نغيّر اللعبة". Confetti.
- Games with their own final (Quiz, Words match, Auction richest, Draw gallery) keep it; for Spy, Geo, Wave this shared screen is the final.
