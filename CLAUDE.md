# Allamma (اللمّة)

Free online party-games club for friends, played from the phone. Players join a room by code or link. First game: **مين الجاسوس؟** (Spy). Goal above everything else: the experience — the look, smoothness and fun.

## Folders
- `01-brainstorm/idea.md`: idea, games list, decisions, Spy rules and scoring, future ideas
- `02-design/design-system.md`: visual identity (read before any UI change). Full design canvas: https://claude.ai/artifact/C9UZ7i6nj7T8ctS9NFJPoZ
- `03-code/`: the app (see `03-code/README.md`)
  - `server/`: NestJS 10 + Socket.IO. All game rules run here. In-memory rooms in `src/rooms/rooms.service.ts`, events in `rooms.gateway.ts`, places pack in `src/spy/places.ts`
  - `client/`: React 18 + Vite + TS, mobile-first, RTL. `src/net.ts` (socket + store), `src/sound.ts` (synthesized sfx + music), `src/components/`, `src/screens/`
- `04-docs/`: architecture, socket events, roadmap. Keep these updated when behaviour changes.
- `05-deploy/`: Render free-tier guide, Dockerfile, compose

## Run
```bash
cd 03-code
npm run install:all
npm run dev:server   # :3000
npm run dev:client   # :5173, proxies /socket.io and /api to :3000
npm run build        # production build (client into client/dist, served by the server)
```
Windows dev machine (PowerShell). If the proxy fails with ECONNREFUSED, first check the server is running; if it is, use `127.0.0.1` instead of `localhost` in `client/vite.config.ts`.

## How to work here
- Talk to the user in English. Code, comments, commits and docs in English. All player-facing UI copy in Egyptian Arabic (colloquial, short, friendly).
- Optimize for speed: fewest steps and tokens that still do the job well. Don't run long test batteries. For server logic changes, one quick socket simulation of the affected flow is enough; for UI-only changes, a type-check plus build (`npx tsc --noEmit && npx vite build` in `client`) is enough. Say which check you ran.
- Before building a roadmap item, check whether it already exists, in the server and in the client separately.
- For every task, tell the user exactly what will change before or while doing it, not just the item name.
- Never trust the client: secrets (the place, who is the spy, guess options) must only be sent to the right player via `viewFor`.
- Keep it free to run: one Render free web service, no paid services, no database unless really needed.

## Design rules (short version — full in 02-design/design-system.md)
- Colors 60/30/10: yellow `#FFD23F` backgrounds; white cards + black `#111` ink and 3px borders; game colors (pink `#FF4F9A`, blue `#4D9DFF`, green `#3DDC97`, orange `#FF8A3D`, purple `#B48CFF`) only in small areas. Pink is never a large background.
- Fonts: Baloo Bhaijaan 2 (800) for headings/numbers, Cairo for body, Marhey for hand-written touches on cards.
- Solid offset shadows (`4px 4px 0 #111`), buttons press into their shadow. Filled colorful icons with black outlines, never thin line icons.
- 8 ready-made characters (`components/art.tsx`), players pick one; no custom builder.
- Loading = skeletons shaped like the next screen, slow (2.4s) yellow-on-yellow shimmer. No spinners, no white/grey shimmer.
- Every interaction has sound (global click handler in `sound.ts` + specific sounds); music and sfx have separate volume/mute.
- Reveal and spy's-guess screens are dark for drama; music goes silent there.

## Status
v0.3: full Spy game online, rooms/chat/reconnect, Egyptian places pack (7 families, 47 places), animations, sfx, background music (maqsoum rhythm, hijaz), sound settings. Not deployed yet. Next steps are in `04-docs/roadmap.md`.
