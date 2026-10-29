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

## Rules
Each player gets five different numbers from 1 to 20. Sort them ascending and submit. The server validates the sequence. A correct first submission wins the round. If the timer expires, nobody gets a point. First to three round wins wins the match.

## Notes
- Rooms live in server memory; a server restart clears rooms and active matches.
- Disconnecting players have a 30-second reconnect window while their room exists. Reconnection is based on a session token stored in that browser.
- For production scale across multiple server instances, add a shared Socket.IO adapter and persistent room storage.
