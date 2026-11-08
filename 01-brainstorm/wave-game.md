# الموجة (Wave) — game 2 design

Design screens: "الموجة · اللعبة التانية" row on the design canvas (https://claude.ai/artifact/C9UZ7i6nj7T8ctS9NFJPoZ).

## Idea
Each turn one player is the **narrator (الراوي)**. They see a half-circle dial between two opposite poles (e.g. "أكلة وحشة ↔ أكلة تحفة") with a hidden target. They give a clue that points to the target's spot. Everyone else places a needle. Then the dial is revealed and points go to whoever was closest.

## Decisions
- **Mode is chosen by the host** in the lounge settings:
  - **Solo (كل واحد لوحده):** each player drags their own needle on their phone and locks it.
  - **Teams (فريقين):** two teams. The narrator's team shares one live needle (anyone on the team can drag it; teammates' finger positions show as small avatar dots) and talks in a team-only chat. The team locks when the majority agrees. Then the other team guesses whether the target is left or right of the needle for 1 bonus point.
  - Host can shuffle teams or tap a player to move them to the other team.
- **Clue:** the narrator can type it (shown big to everyone) or tap "قلته بصوتي" (for people in the same place or on a call).
- The narrator can redraw the card once per turn ("كارت تاني").
- Rounds are counted in "turns around the table": 1, 2 or 3 times everyone is the narrator.

## Scoring
- Target zones, each 9° wide: center = 4, next = 3, outer = 2, outside = 0.
- Solo: each guesser gets the zone points. The narrator gets the average of the guessers' points (rounded), which rewards good clues.
- Teams: the narrator's team gets the zone points of the shared needle; the other team gets +1 if their left/right call is correct.

## Screens
1. Host settings (mode, rounds, teams editor)
2. Narrator: dial with visible target zones, poles, clue input, "قلته بصوتي", one redraw, send
3. Solo guess: clue card, draggable needle, who has locked, lock / change mind
4. Team guess: team scores, shared needle with teammates' dots, team chat, lock with majority count, hint about the other team's left/right call
5. Reveal (dark, like the Spy reveal): cover rotates away, all needles with avatars, target zones, points list incl. the narrator's average

## Server notes
- Target angle is secret: only the narrator's view gets it until reveal.
- Needle positions: in solo mode keep each guess private until reveal (show only "locked" status). In team mode broadcast the shared needle to that team only, throttled (~10 updates/sec).
- Timers on the server like the Spy game.

## Card pairs (Egyptian, starter list)
رخيص ↔ غالي · ممل ↔ تحفة · مصري جداً ↔ مش مصري خالص · بيتاكل في الشارع ↔ بيتاكل في فرح · الكبار بيحبوه ↔ الشباب بيحبوه · سهل ↔ صعب · قديم ↔ جديد · أكلة وحشة ↔ أكلة تحفة · فلوس كتير ↔ مفلس خالص · هادي ↔ دوشة · مفيد ↔ ملوش لازمة · مشهور ↔ محدش يعرفه · صيفي ↔ شتوي · مركّز ↔ سرحان · رومانسي ↔ مش رومانسي · مخيف ↔ كيوت
