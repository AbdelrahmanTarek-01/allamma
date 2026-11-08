# Home v2 + upcoming games + global leaderboard

Home (canvas: HomeV2, row 1):
- Remove "العب مع ناس" button (duplicate of public rooms list; leads to empty state early on).
- Primary CTA: big black "اعمل قعدة". Row below: "ادخل بكود" + "قعدات مفتوحة" (count badge).
- Header: logo, "الترتيب" trophy button, sound, avatar.
- Games grid ends with a black card "بنحضّر ٧ كمان" opening a sheet of upcoming ideas with a vote button each (one vote per player per idea; counts stored server-side later).

Upcoming ideas (sheet content):
1. اسم حيوان جماد بلاد — random letter, fill each category; unique answers score more.
2. المافيا — hidden killers; night choices, day discussion + vote.
3. ماتقولش الكلمة — describe word without 3 forbidden words (teams).
4. الكدبة الحلوة — weird question; everyone writes a convincing fake answer; others find the real one.
5. مين فينا؟ — "who's most likely to…" group vote.
6. صدق ولا كدب — 3 statements about yourself, one is a lie.
7. تليفون مكسور — sentence > drawing > sentence chain.

Global leaderboard (canvas: GlobalBoard, row 1) — LATER, needs accounts:
- Guests play everything with no sign-up (default). Global ranking only for Google-signed-in users.
- Signing in links the current guest playerId (character + past points) to the account.
- Tabs: week / month / all time. Points = same placement points as room leaderboard.
- Anti-abuse: count only games with 3+ players, cap points per day, ignore rooms where the same few accounts repeat endlessly.
