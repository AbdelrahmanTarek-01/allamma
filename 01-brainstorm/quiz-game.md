# حزّورة (Quiz board) — game design

Design screens: "حزّورة" row on the design canvas (https://claude.ai/artifact/C9UZ7i6nj7T8ctS9NFJPoZ). The first single-screen prototype is 02-design/hazzoura-prototype.html (old look; the canvas is the reference now).

## Idea
Two teams, a board of categories and point values (200 / 400 / 600). Teams take turns picking a cell, answer a multiple-choice question together from their own phones, and the other team can steal when they're wrong. Online-first: every player is on their own phone; no judge needed because answers are multiple choice.

## Flow
1. **Teams**: host assigns or shuffles players into two teams (same team editor as الموجة).
2. **Category draft**: 15 categories on screen. Teams pick alternately until each has 3 (6 total). Anyone on the team on turn can pick; 15 s per pick, then a random pick. The picked chip animates into that team's slot.
3. **Board**: 6 category rows × 3 cells (200 / 400 / 600) = 18 questions. A colored underline shows which team drafted each category (no gameplay effect, it's just theirs). Used cells take the color of the team that won them (grey if nobody). Hidden: one treasure cell (x2) and one bomb (wrong answer loses the value). Turn passes to a different player of the team each time ("دور عبدالرحمن يختار خانة لفريقه").
4. **Question (team on turn)**: question card, 4 options, 20 s ring timer. Every teammate taps an option; teammates' choices show as their avatars on the options; the team chat stays available. Anyone can tap "ثبّت إجابة الفريق" to lock the current majority; on timeout the majority is used (ties = no answer). The other team watches the same question with options disabled.
5. **Steal**: if wrong (or no answer), the other team gets 10 s with the wrong option struck out. Correct steal = the full value.
6. **Answer reveal**: correct option glows green, wrong pick shakes red, "+value" flies to the team score which bumps; a one-line fact about the answer.
7. **Final**: score bars race up, trophy pops with rotating rays, "الفريق X كسب!", winning team's characters hop, confetti. Small stats: board star (most correct answers), best moment (e.g. a late steal). Host buttons: "نلعبها تاني" / "نغيّر اللعبة".

## Power cards (each team once per game)
- ×٢ (دبّل): activate before picking a cell; doubles that question.
- ٥٠:٥٠: removes two wrong options for your team.
- سرقة: on the other team's question, answer first instead of waiting for them to miss.

## Scoring
Cell value, x2 with دبّل or treasure, bomb subtracts the value on a wrong answer. Steal = full value. Settings: board size (short 3 rows × 6 = 18 / full 36 with two questions per value), seconds per question (15/20/30), power cards on/off.

## Content
Starter pack: 15 categories × at least 12 questions each (4 per value), Egyptian-written, each with 4 options, the correct one, difficulty = value, and a one-line fact. Categories: كورة مصرية، أفلام زمان، مسلسلات، أكل مصري، أغاني، جغرافيا، تاريخ، كمّل المثل، علوم، ماركات، كرتون، ألغاز، عربيات، رياضة عالمية، تكنولوجيا. Questions never repeat for the same room in one session.

## Server notes
- The correct option is never sent before the reveal. Teammates' votes are sent to their own team only; the other team only sees "they're choosing".
- Treasure/bomb positions are secret until opened.
- All timers on the server; majority computed on the server.

## Update (design round 2)
- Team headers are compact: team name + a small chip with a person icon and the player count (no wrapping).
- Board: a header row above the cells "سهل / متوسط / صعب", and every unused cell shows the number with a small "نقطة" under it, so the picker knows what a cell is worth.
- Power cards are shown as small playing cards with a name and a one-line explanation each (×٢ دبّل: نقط السؤال الجاي بالضعف · ٥٠:٥٠: يتشال اختيارين غلط · سرقة: تجاوبوا قبل الفريق التاني). Used cards are faded with "اتلعب خلاص".
- Question screen: the power card sits in its own "كروتكم:" row between the question and the options, never next to the lock button (to avoid mis-taps). The lock button is full width alone at the bottom.
- Minimum players: 4 (two per team). See also the club-wide rule below.

## Club-wide rule: minimum players per game
Every game tile (Home and the lounge game picker) shows a small chip with a person icon and the minimum players, e.g. "٣+". In the lounge, if there aren't enough players, the start button says "محتاجين <n> لاعيبة على الأقل" instead of starting.
- مين الجاسوس؟ 3+
- فين دي؟ 2+ (1 allowed as practice)
- الموجة 3+ solo, 4+ teams
- حزّورة 4+
- شبكة الكلمات 4+
- مزاد المعلومات 2+
- ارسم وخمّن 3+

## Build notes
- Design files: 02-design/canvas/Quiz*.dc.html (QuizDraft, QuizBoard, QuizQuestion, QuizSteal, QuizFinal). Read markup/JS for exact layout, copy and timings.
- Difficulty knobs from difficulty.md. "؟" help sheet on every game screen, same pattern as Words.
