# Speed Sorting — Real-Time Multiplayer

A real-time online card-sorting game built with React + TypeScript + Vite and Node.js + Express + Socket.IO.

## Features
- Create/join rooms with a room code
- Host starts after at least two players are ready
- Five unique cards per player, drawn from 1–20 and shuffled
- Drag/drop or select two cards to swap positions
- Server-authoritative answer validation and scoring
- 45-second rounds, first to three round wins
- Round results, rematch, basic disconnect grace period
- Responsive desktop/mobile UI

## Run locally
Requirements: Node.js 20+.

Terminal 1:
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Terminal 2:
```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL (usually http://localhost:5173) in two separate browser sessions.

## Environment variables

Server (`server/.env`):
- `PORT=3001`
- `CLIENT_ORIGIN=http://localhost:5173` (comma-separated origins are supported)

Client (`client/.env`):
- `VITE_SERVER_URL=http://localhost:3001`

Never commit secrets. This project does not require API keys.

## Deploy: Render backend + Vercel frontend

### Render
1. Push this project to a GitHub repository.
2. Create a **Web Service** on Render, select the repository.
3. Set **Root Directory** to `server`.
4. Build command: `npm install`
5. Start command: `npm start`
6. Set environment variable `CLIENT_ORIGIN` to your deployed Vercel origin, e.g. `https://your-game.vercel.app`.
7. Deploy and copy the Render service URL, e.g. `https://your-game-api.onrender.com`.

### Vercel
1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `client`.
3. Set environment variable `VITE_SERVER_URL` to your Render service URL.
4. Deploy.
5. If the Vercel URL changes, update Render's `CLIENT_ORIGIN` and redeploy.

Then test with two separate devices. The URL examples above are examples, not live deployments. This source bundle has not been deployed automatically because deployment requires access to your hosting accounts.

## Rules
Each player gets five different numbers from 1 to 20. Sort them ascending and submit. The server validates the sequence. A correct first submission wins the round. If the timer expires, nobody gets a point. First to three round wins wins the match.

## Notes
- Rooms live in server memory; a server restart clears rooms and active matches.
- Disconnecting players have a 30-second reconnect window while their room exists. Reconnection is based on a session token stored in that browser.
- For production scale across multiple server instances, add a shared Socket.IO adapter and persistent room storage.
