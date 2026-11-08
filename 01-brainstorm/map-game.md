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
