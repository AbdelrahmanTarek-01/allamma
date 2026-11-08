# فين دي؟ (Where is it?) — game 2 design

Replaces الموجة as the next game (الموجة is parked; its screens stay on the canvas).
Design screens: "فين دي؟" row on the design canvas (https://claude.ai/artifact/C9UZ7i6nj7T8ctS9NFJPoZ).
Map style reference: `02-design/egypt-map.svg` (our own stylized map: white land, black 3px outline, pale blue sea, soft-yellow neighbours, Nile in blue). Generated from Natural Earth data (public domain) via the npm package world-atlas.

## Idea
Each round shows a place name. Everyone taps the map to drop a pin, at the same time, on their own phone, and locks it. Then the reveal: pins drop one by one, lines draw to the real spot, distances count up, and the closest player gets a crown. No talking needed, so it works great in public rooms with strangers.

## Themes (host picks in the settings gear)
- محافظات ومدن مصر (Egypt map)
- معالم مصر (Egypt map)
- الوطن العربي (Arab world map)
- العالم (world map)
- ملاعب الكورة (Egypt or world map)
- الأكلة دي منين؟ (dish -> origin country, Arab/world map)
Each theme = a map + a list of places {name, lat, lon, difficulty, one-line fact shown on the results}.

## Settings
Theme, difficulty (سهل / متوسط / صعب / مكس), places per game (5/10/15), seconds per place (10/20/30).

## Scoring
- Distance via haversine on lat/lon (the map projection is only for display).
- points = round(1000 * exp(-km / scale)), with scale per map: Egypt 150 km, Arab world 400 km, world 1500 km.
- Multiplied by difficulty: easy x1, medium x1.5, hard x2.
- +50 speed bonus if locked within the first 5 seconds.
- No pin = 0.

## Screens
1. Settings sheet (gear): theme cards, difficulty, number of places, time per place
2. Guess: place name card, map (tap to drop/move the pin, + / − zoom and pinch on phones), who has locked, lock / change mind
3. Reveal (dark): pins drop one by one, lines draw to the real spot (star), distance labels, "X الأقرب!" banner
4. Round results: ranking with distance, points this round and total, one-line fact about the place, how-points-work note

## Server notes
- The true location is secret until the reveal. Pins stay private until the reveal (only "locked" status is broadcast).
- Server timer per place; auto-lock whatever pin exists when time ends.
- Maps are static SVG files in the client (no paid map API, works on weak connections). Store each map's projection parameters so the client converts tap -> lat/lon and the server only deals with lat/lon.

## Update (design round 2)
- **Map scope chosen by the host**: مصر / الوطن العربي / العالم. Each scope has its own themes (places, landmarks, stadiums, "where is this dish from"). World map style reference: stylized Natural Earth projection (white countries, black outlines, pale blue sea, Egypt highlighted).
- **Personal hints**: every place has a pool of 3-4 hints of similar strength. Each player gets a different random hint, visible only to them, behind a "تلميح" button. Using it costs 25% of that round's points. The server only sends a player their own hint, and only after they tap the button.
- **Map controls**: pinch to zoom and drag to pan on phones (mouse wheel on desktop), plus + / − / fit-to-map buttons. A tap without dragging drops or moves the pin. The pin keeps the same size at any zoom.
- **Who locked**: show at most 3 avatars + a "+N" chip + "٦ من ١٠ ثبّتوا". Tapping opens a sheet with every player's status.
- **Reveal animation**: the camera zooms from the whole map to the area around all pins and the target. Pins drop one by one (farthest first, closest last). Each pin draws a curved line to the target like a line chart, with a moving dot at its head and a distance tag that counts up. Below the map, a distance bar chart grows in sync and re-sorts, and the closest gets a crown. Then the "X الأقرب!" banner shows how much closer they were than you.

## Update (design round 3)
- **Hint types** (each player gets one random type, all similar in strength, -25% points):
  - text: a written clue only that player sees
  - circle: an animated pink dashed circle grows on the map; the place is somewhere inside it. The circle center is offset randomly so the target is never in the middle.
  - half: one side of the map gets shaded with a sweep animation ("the place isn't here"). On the world map this can rule out whole continents.
  - Only use map hints where they don't give the answer away (circle radius scales with difficulty and map size).
- **Reveal screen** uses the yellow game look (no black background), black-outlined cards like the rest of the app.
- Settings label "التيمة" is shown to players as "هتدوّروا على إيه؟" (the type of places in the game).

## Update (design round 4)
- **Map hint rules (so hints never give the answer away)**, checked on the server when picking a player's hint type:
  - circle: radius at least 30% of the map's short side; the target sits randomly between 35% and 75% of the radius from the center (never in the middle); allowed only if the circle also contains at least 3 other places from the same pack, so it doesn't single out one spot. Otherwise fall back.
  - half: allowed only if the unshaded side still contains at least 40% of the pack's places.
  - text: always allowed, the fallback.
  - Hard places get text hints only.
- **Reveal celebration**: after the lines finish, a winner card pops in (character bounces, a crown drops onto its head, "+points" sticker), with a confetti burst over the screen. The distance bars stay above it.
- **Results ranking animation**: rows start in the previous order, the "+points" chips appear and totals count up, then rows slide to their new positions (overtakers move above, with a springy ease). Each row that moved shows "▲ n" (green) or "▼ n" (red). The leader gets a highlighted card. A replay button re-runs it.
