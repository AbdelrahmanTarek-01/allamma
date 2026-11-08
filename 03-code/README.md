# Allamma (اللمّة) — code

Free online party-games club for friends, played from the phone. First game: **مين الجاسوس؟**

```
03-code/
├── server/   NestJS + Socket.IO — rooms, players, game logic (all rules run on the server)
│   └── src/
│       ├── main.ts               app bootstrap, /api/health, serves the built client
│       ├── rooms/rooms.service.ts  rooms + spy game state machine
│       ├── rooms/rooms.gateway.ts  socket events -> service calls
│       └── spy/places.ts         Egyptian places pack (families of similar places)
└── client/   React + Vite + TypeScript — mobile-first RTL UI
    └── src/
        ├── net.ts                socket connection, store, profile, acks
        ├── components/art.tsx    characters, game icons
        ├── components/ui.tsx     timer, bottom sheet, skeleton screens
        └── screens/              Onboarding, Home, Room, Spy (all game phases)
```

## Run locally

Needs Node 20+.

```bash
npm run install:all
npm run dev:server     # http://localhost:3000
npm run dev:client     # http://localhost:5173  (proxies /socket.io and /api to :3000)
```

Open http://localhost:5173 in 3+ browser windows (use a private window for each player, because the player id lives in localStorage).

## Production build (what Render runs)

```bash
npm run build   # builds client into client/dist, then server into server/dist
npm start       # one Node process: API + sockets + static client on $PORT
```

See `../05-deploy/deploy-render.md`.
