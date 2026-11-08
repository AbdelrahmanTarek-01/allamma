# Roadmap

## Done (v0.1)
- Visual identity: colors, font, icons, characters, and the screens on the design canvas.
- Onboarding with a name and 8 ready-made characters, no account needed.
- Rooms: code and invite link, players, ready state, chat, host settings, reconnect.
- Full "مين الجاسوس؟": roles, turns, server timers, voting, dramatic reveal, the spy's last guess from similar places, points, rounds, final ranking.
- Egyptian places pack: 7 families, 47 places, 5 roles each.
- Skeleton screens while waking or reconnecting.
- One-service deploy ready for Render free.

## Done (since v0.3)
- **Lounges (قعدة):** persistent rooms that play game after game, lounge scores across games, "play again" and a game picker, game engine interface (Spy lives in `games/spy/`).
- **Public and private lounges:** lobby list on Home, quick play, lock joining, bans after a kick, bad-words filter and chat rate limit.
- **Chat:** floating chat with quick replies and bubbles everywhere, history once on join then one message at a time, system dividers, last 50 messages in memory.
- **Spy rules:** 1-3 spies by player count, difficulty per place (easy / medium / hard / mix) with point multipliers, settings behind the host's gear (generic schema per game).
- **New game: فين دي؟ (map pin game):** pin the place on our own stylized maps (Egypt / Arab world / world, generated from Natural Earth), personal hints (text / circle / half map, -25%), animated reveal and results. 219 starter places in `games/map/places/`.
- **Shared difficulty (Spy first):** one host-only level per lounge (سهل / متوسط / صعب / ماكس) with one table per game (`SPY_LEVELS`): question time, guess options, place tiers 1-4, second spy on max. Next: add the map row (and the other games' rows) from `01-brainstorm/difficulty.md`.
- **How to play:** "?" help sheet per game, opened once automatically the first time a game starts.
- Host controls (kick, make host), phone layout pass (players strip, docked start button, game tiles), onboarding edit mode with a back button and back gesture, same role card for every role.

## Next
1. **Deploy and play with friends**, and write down what feels slow or confusing.
2. ~~Sounds, vibration and animations~~ (done in v0.2).
   ~~Background music (maqsoum rhythm, hijaz), separate music/effects volume, a sound on every button, calmer yellow skeletons~~ (done in v0.3).
3. Emoji reactions during the reveal.
4. PWA (installable, own icon).
5. Second game: **الموجة**.
6. More place packs, chosen by the host.
7. Redis plus a second instance, only if usage needs it.
