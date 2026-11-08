# ارسم وخمّن (Draw & Guess) — 3+ players, solo scoring

- Rounds: everyone draws once per cycle (host: 1 or 2 cycles). Draw time per difficulty (medium 70s).
- Pick: drawer picks 1 of 3 words — easy 100, medium 200, hard 300 points. 10s; auto-picks easy on timeout. Others see "X بيختار كلمة…" + draw order.
- Drawing: colours (6), 3 brush sizes, eraser (none on max), undo, clear. No writing letters (honour rule). Strokes streamed live to guessers (throttle ~30/s, send simplified points).
- Guessing: free-text input; normalise أ/إ/آ=ا, ة=ه, ى=ي, trim. Correct: points = wordPoints * (0.5 + 0.5 * timeLeft/total); guess hidden from others ("X خمّنتها!"). One-letter-off = private "قريب!".
- NO automatic letter reveal and no letter-count blanks (too easy).
- Guess attempts per player per round: easy 4, medium 3, hard 2, max 2 (hearts UI). Wrong and 'قريب' guesses both use an attempt. Out of attempts: input disabled until next round.
- Hint card 'اكشف حرف': only for words with 5+ letters; uses per game: easy 2, medium 1, hard 1, max 0. Shows ONE random letter that is in the word (no position, no letter count), to that player only; that player's points for the round are halved.
- Word choices must be ordered by real drawing difficulty (easy = simple shape, medium = more detail, hard = concept). Word pool depends on game difficulty: easy level = objects; medium = places/things; hard = situations/ideas; max = feelings/proverbs.
- Drawer gets 50 per correct guesser (cap at word points). Round ends when all guessed or time ends.
- Round end: word reveal, drawing, gains, next drawer countdown 8s.
- Final: winner + "معرض الليلة" gallery of all drawings with heart likes; "فنان الليلة" = most hearts. Placement feeds room leaderboard.
- Word list: ~300 Egyptian words tagged easy/medium/hard (objects / places & things / ideas & proverbs).
Design: 02-design/canvas/Draw*.dc.html (DrawPick role tweak drawer/watcher, DrawDraw, DrawGuess, DrawRound, DrawFinal).
- Guessers watch the drawing live (strokes streamed), with a "● بيرسم دلوقتي" live badge on the canvas.
- Two phases per round. DRAW phase: guessers watch live, guess input locked. Drawer presses "خلصت · سلّم الرسمة" (disabled while empty) or draw time ends = auto-submit. GUESS phase: canvas locked, short guess timer per difficulty (easy 30s, medium 20s, hard 15s, max 10s), red countdown. Points scale with guess-phase time left.
- Never show letter count or blanks to guessers.
