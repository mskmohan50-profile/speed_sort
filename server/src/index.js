import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomInt, randomUUID } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3001);
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: origins, credentials: true }));
app.get('/', (_req, res) => res.json({ name: 'Speed Sorting API', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size }));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: origins, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling']
});

const rooms = new Map();
const ROUND_SECONDS = Math.max(15, Number(process.env.ROUND_SECONDS || 45));
const RECONNECT_MS = 30_000;

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function shuffledCards() {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}
function publicState(room, socketId) {
  const player = [...room.players.values()].find(p => p.socketId === socketId);
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, round: room.round,
    deadline: room.deadline, winnerId: room.winnerId, winnerName: room.winnerName,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      score: p.score, submitted: p.submitted
    })),
    yourId: player?.id,
    yourCards: player?.cards ? [...player.cards] : undefined
  };
}
function broadcast(room, message) {
  for (const p of room.players.values()) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('room:state', { ...publicState(room, p.socketId), message });
    }
  }
}
function emitError(socket, message) { socket.emit('error:message', message); }
function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}
function cleanupRoom(room) {
  clearTimer(room);
  rooms.delete(room.code);
}
function endRound(room, winner) {
  if (room.phase !== 'playing') return;
  clearTimer(room);
  room.phase = 'roundResult';
  room.winnerId = winner?.id || null;
  room.winnerName = winner?.name || null;
  if (winner) winner.score += 1;
  broadcast(room, winner ? `${winner.name} won round ${room.round}!` : 'Time is up. No one won this round.');
  const champion = [...room.players.values()].find(p => p.score >= 3);
  if (champion) {
    room.phase = 'finished';
    room.winnerId = champion.id;
    room.winnerName = champion.name;
    broadcast(room, `${champion.name} wins the match!`);
    return;
  }
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code) || room.phase !== 'roundResult') return;
    room.round += 1;
    startRound(room);
  }, 4500);
}
function startRound(room) {
  clearTimer(room);
  room.phase = 'countdown';
  room.winnerId = null;
  room.winnerName = null;
  for (const p of room.players.values()) {
    p.cards = shuffledCards();
    p.submitted = false;
  }
  broadcast(room, `Round ${room.round} is getting ready.`);
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code) || room.phase !== 'countdown') return;
    room.phase = 'playing';
    room.deadline = Date.now() + ROUND_SECONDS * 1000;
    broadcast(room, 'Go! Sort your cards from smallest to largest.');
    room.timer = setTimeout(() => endRound(room, null), ROUND_SECONDS * 1000);
  }, 2500);
}
function roomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function joinSocket(socket, room, player) {
  player.socketId = socket.id;
  player.connected = true;
  player.disconnectedAt = null;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}
function sendState(room, message) { broadcast(room, message); }

io.on('connection', socket => {
  socket.on('room:create', payload => {
    const name = String(payload?.name || '').trim().slice(0, 18);
    const session = String(payload?.session || socket.id).slice(0, 100);
    if (!name) return emitError(socket, 'Enter a player name.');
    const code = makeCode();
    const player = { id: randomUUID(), session, name, ready: false, connected: true, socketId: socket.id, score: 0, submitted: false, cards: null };
    const room = { code, hostId: player.id, players: new Map([[player.id, player]]), phase: 'lobby', round: 0, deadline: null, winnerId: null, winnerName: null, timer: null };
    rooms.set(code, room);
    joinSocket(socket, room, player);
    sendState(room, `Room ${code} created. Invite a friend to join.`);
  });

  socket.on('room:join', payload => {
    const name = String(payload?.name || '').trim().slice(0, 18);
    const code = String(payload?.code || '').trim().toUpperCase();
    const session = String(payload?.session || socket.id).slice(0, 100);
    const room = rooms.get(code);
    if (!name) return emitError(socket, 'Enter a player name.');
    if (!room) return emitError(socket, 'Room not found. Check the code and try again.');
    if (room.phase !== 'lobby' && room.phase !== 'finished') return emitError(socket, 'That match is already in progress.');
    const existing = [...room.players.values()].find(p => p.session === session);
    if (existing) {
      joinSocket(socket, room, existing);
      return sendState(room, `${name} reconnected.`);
    }
    if (room.players.size >= 4) return emitError(socket, 'This room is full (maximum 4 players).');
    const player = { id: randomUUID(), session, name, ready: false, connected: true, socketId: socket.id, score: 0, submitted: false, cards: null };
    room.players.set(player.id, player);
    joinSocket(socket, room, player);
    sendState(room, `${name} joined the room.`);
  });

  socket.on('room:chat', payload => {
    const room = roomForSocket(socket); if (!room) return;
    const p = room.players.get(socket.data.playerId); if (!p || !p.connected) return;
    const text = String(payload?.text || '').trim().slice(0, 180);
    if (!text) return;
    io.to(room.code).emit('room:chat', { id: randomUUID(), name: p.name, text, at: Date.now() });
  });

  socket.on('room:reaction', payload => {
    const room = roomForSocket(socket); if (!room) return;
    const p = room.players.get(socket.data.playerId); if (!p || !p.connected) return;
    const allowed = new Set(['👏', '😂', '😈', '🔥', '😮', '💪']);
    const emoji = String(payload?.emoji || '');
    if (!allowed.has(emoji)) return;
    io.to(room.code).emit('room:reaction', { id: randomUUID(), name: p.name, emoji, at: Date.now() });
  });

  socket.on('player:ready', payload => {
    const room = roomForSocket(socket); if (!room || room.phase !== 'lobby') return;
    const p = room.players.get(socket.data.playerId); if (!p) return;
    p.ready = typeof payload?.ready === 'boolean' ? payload.ready : !p.ready;
    sendState(room, `${p.name} ${p.ready ? 'is ready' : 'is not ready'}.`);
  });

  socket.on('game:start', () => {
    const room = roomForSocket(socket); if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || p.id !== room.hostId) return emitError(socket, 'Only the host can start the match.');
    if (room.phase !== 'lobby') return emitError(socket, 'The match has already started.');
    if (room.players.size < 2) return emitError(socket, 'At least two players are required.');
    if (![...room.players.values()].every(player => player.ready && player.connected)) return emitError(socket, 'Every connected player must be ready.');
    room.round = 1;
    for (const player of room.players.values()) player.score = 0;
    startRound(room);
  });

  socket.on('answer:submit', payload => {
    const room = roomForSocket(socket); if (!room || room.phase !== 'playing') return;
    const p = room.players.get(socket.data.playerId);
    if (!p || p.submitted || !Array.isArray(payload?.cards)) return;
    const submitted = payload.cards;
    if (submitted.length !== 5 || submitted.some(n => !Number.isInteger(n) || n < 1 || n > 20)) return emitError(socket, 'Invalid answer. Use your five cards.');
    if (!p.cards || submitted.some((n, i) => n !== p.cards[i] && !p.cards.includes(n))) return emitError(socket, 'Your submitted cards do not match your hand.');
    if (new Set(submitted).size !== 5 || !submitted.every(n => p.cards.includes(n))) return emitError(socket, 'Your submitted cards do not match your hand.');
    if (submitted.every((n, i) => i === 0 || submitted[i - 1] < n)) {
      p.submitted = true;
      endRound(room, p);
    } else {
      socket.emit('game:notice', 'Not quite! Your cards are not in ascending order. Keep trying.');
      broadcast(room, `${p.name} submitted an incorrect order and is still racing.`);
    }
  });

  socket.on('game:rematch', () => {
    const room = roomForSocket(socket); if (!room || room.phase !== 'finished') return;
    const p = room.players.get(socket.data.playerId); if (!p) return;
    p.ready = true;
    const connected = [...room.players.values()].filter(player => player.connected);
    if (connected.length >= 2 && connected.every(player => player.ready)) {
      for (const player of room.players.values()) { player.score = 0; player.ready = false; }
      room.round = 1;
      startRound(room);
    } else {
      broadcast(room, `${p.name} wants a rematch. Waiting for other players.`);
    }
  });

  socket.on('room:leave', () => {
    const room = roomForSocket(socket); if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (p) room.players.delete(p.id);
    socket.leave(room.code);
    socket.data.roomCode = null; socket.data.playerId = null;
    if (!room.players.size) cleanupRoom(room);
    else {
      if (room.hostId === p?.id) room.hostId = [...room.players.keys()][0];
      if (room.players.size < 2 && room.phase !== 'lobby' && room.phase !== 'finished') {
        clearTimer(room); room.phase = 'lobby'; room.round = 0; room.deadline = null;
        for (const player of room.players.values()) { player.score = 0; player.ready = false; player.cards = null; }
      }
      sendState(room, `${p?.name || 'A player'} left the room.`);
    }
  });

  socket.on('disconnect', () => {
    const room = roomForSocket(socket); if (!room) return;
    const p = room.players.get(socket.data.playerId); if (!p) return;
    p.connected = false; p.socketId = null; p.disconnectedAt = Date.now();
    sendState(room, `${p.name} disconnected. Reconnect window: 30 seconds.`);
    setTimeout(() => {
      const current = rooms.get(room.code);
      const player = current?.players.get(p.id);
      if (!player || player.connected || Date.now() - player.disconnectedAt < RECONNECT_MS) return;
      current.players.delete(p.id);
      if (current.hostId === p.id && current.players.size) current.hostId = [...current.players.keys()][0];
      if (!current.players.size) cleanupRoom(current);
      else sendState(current, `${p.name} was removed after disconnect timeout.`);
    }, RECONNECT_MS);
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Speed Sorting server listening on ${port}`);
});
