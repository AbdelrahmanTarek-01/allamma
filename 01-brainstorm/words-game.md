# شبكة الكلمات (Word grid) — game design

Design screens: "شبكة الكلمات" row on the design canvas (https://claude.ai/artifact/C9UZ7i6nj7T8ctS9NFJPoZ). Our own game and name; no third-party branding.

## Idea
Two teams. Each team has one "الدليل" (clue giver). Everyone sees 20 words (4 × 5 grid, sized for phones). Only the two guides see the hidden colors: 7 words for the starting team, 6 for the other team, 6 neutral, 1 bomb. The guide gives ONE word + a number ("مية · ٣" = three of our words relate to water). The team flips words. First team to reveal all its words wins; flipping the bomb loses instantly.

## Flow
1. Teams + guides: host assigns teams (same team editor as the other team games); each team picks its guide (or random). Guides rotate each new board.
2. Guide screen: grid with colors visible (blue / orange / beige neutral / black bomb with a small icon), flipped words faded and struck through, a color legend, clue input (one word, max 16 chars) + number stepper (1-7), send button "ابعت «مية · ٣»". The clue may not be a word on the board (server checks, also simple prefix/suffix matches).
3. Team guess screen: team scores ("فاضل n" words for each team), the clue card with the guide's avatar, tries counter (= number + 1). Tapping a word marks it with your avatar dot; teammates see each other's dots live (team only). Anyone taps "اقلب «word»" to flip the most-marked/selected word. The card flips in 3D to its color. Result toast: right = "صح! كمّلوا"; neutral = turn ends; other team's word = it counts for them and the turn ends; bomb = game over. "كفاية كده" ends the turn early (allowed after at least one flip).
4. The other team watches the flips live but can't interact; their own chat stays available.
5. End: bomb version = screen shakes, white flash, rings + debris, "بوووم!", background goes dark, "قنبلة! الأزرق خسر", list of the words that were left. Win version = the team's cards pop in a tilted grid, "كسبنا!", confetti, by how many words they won.

## Rules and timers
- Guide has 90 s to give a clue; team has 60 s + 15 s per extra try. Timeouts end the turn.
- Words come from Egyptian packs (عام، أكل، أماكن، كورة، أفلام…) chosen in settings. 20 random words per board, no repeats in a session.
- Points for the lounge leaderboard: winning team members +300 each, guides +100 extra if their team won.

## Server notes
- The color key is sent only to the two guides. Everyone else only learns a word's color when it's flipped.
- Marks (avatar dots) are broadcast to the same team only.
- Minimum players: 4 (each team needs a guide and at least one guesser).

## Final decisions (latest)
- Board 20 words (4x5). Counts per difficulty from difficulty.md (medium: 7 per team, 5 neutral, 1 bomb).
- Team picks (dots) visible to own team only; hidden from the other team. Max difficulty: picks secret, majority decides.
- Match = best of 1/3/5 boards (host, default 3). Screens: WordsSetup, WordsGuide, WordsGuess, WordsEnd (per board: bomb/win), WordsMatch (match result + 4 awards).
- "؟" help sheet on every game screen (content in WordsGuess.dc.html).
- Design files: 02-design/canvas/Words*.dc.html (open in a browser or read the markup/JS for exact layout, copy and animation timings).
