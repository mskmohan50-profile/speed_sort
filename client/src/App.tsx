import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { io, Socket } from 'socket.io-client';

type Player = { id: string; name: string; ready: boolean; connected: boolean; score: number; submitted: boolean };
type ChatMessage = { id: string; name: string; text: string; at: number };
type Reaction = { id: string; name: string; emoji: string; at: number };
type RoomState = {
  code: string; hostId: string; phase: 'lobby' | 'countdown' | 'playing' | 'roundResult' | 'finished';
  players: Player[]; round: number; deadline: number | null; winnerId: string | null;
  winnerName: string | null; message?: string; yourCards?: number[]; yourId?: string;
};
const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function getSession() {
  let token = localStorage.getItem('speed-sorting-session');
  if (!token) { token = crypto.randomUUID(); localStorage.setItem('speed-sorting-session', token); }
  return token;
}
function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [state, setState] = useState<RoomState | null>(null);
  const [cards, setCards] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(45);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const session = useMemo(getSession, []);

  useEffect(() => {
    const s = io(SERVER, { transports: ['websocket', 'polling'], auth: { session } });
    setSocket(s);
    s.on('room:state', (next: RoomState) => {
      setState(next);
      if (next.yourCards) setCards(next.yourCards);
      if (next.phase === 'lobby') setCards([]);
      if (next.message) setNotice(next.message);
    });
    s.on('error:message', (message: string) => setNotice(message));
    s.on('connect_error', () => setNotice(`Can't connect to game server at ${SERVER}. Check that the backend is running.`));
    s.on('game:notice', (message: string) => setNotice(message));
    s.on('room:chat', (message: ChatMessage) => setChatMessages(old => [...old, message].slice(-60)));
    s.on('room:reaction', (reaction: Reaction) => {
      setReactions(old => [...old, reaction].slice(-8));
      window.setTimeout(() => setReactions(old => old.filter(item => item.id !== reaction.id)), 3500);
    });
    return () => { s.disconnect(); };
  }, [session]);

  useEffect(() => {
    if (!state?.deadline) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((state.deadline! - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [state?.deadline]);

  const me = state?.players.find(p => p.id === state.yourId);
  const isHost = !!state && state.hostId === state.yourId;
  const emit = (event: string, payload?: unknown) => socket?.emit(event, payload);
  const createRoom = () => {
    if (!name.trim()) return setNotice('Enter your name first.');
    emit('room:create', { name: name.trim().slice(0, 18), session });
  };
  const joinRoom = () => {
    if (!name.trim()) return setNotice('Enter your name first.');
    if (!roomCode.trim()) return setNotice('Enter a room code.');
    emit('room:join', { name: name.trim().slice(0, 18), code: roomCode.trim().toUpperCase(), session });
  };
  const swap = (index: number) => {
    if (selected === null) { setSelected(index); return; }
    if (selected !== index) setCards(old => {
      const next = [...old]; [next[selected], next[index]] = [next[index], next[selected]]; return next;
    });
    setSelected(null);
  };
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setCards(old => { const next = [...old]; const [card] = next.splice(from, 1); next.splice(to, 0, card); return next; });
  };
  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || !state) return;
    emit('room:chat', { text });
    setChatDraft('');
  };
  const share = async () => {
    const link = `${location.origin}/?room=${state?.code}`;
    try { await navigator.clipboard.writeText(link); setNotice('Invitation link copied! Send it to your friend.'); }
    catch { setNotice(`Share this room code: ${state?.code}`); }
  };

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark">S</span><span>speed<span className="brand-accent">sorting</span></span></a>
      <div className="online-pill"><span className="pulse" /> LIVE MULTIPLAYER</div>
    </header>
    {!state ? <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span>⚡</span> THINK FAST. SORT FASTER.</div>
        <h1>Fast hands.<br/><span>Faster mind.</span></h1>
        <p className="lead">Race your friends to put the numbers in order. One room, one winner, absolutely no time to waste.</p>
        <div className="feature-row"><span>♧ 2+ players</span><span>◷ 45-second rounds</span><span>♛ First to 3 wins</span></div>
      </div>
      <div className="join-card">
        <div className="card-kicker">READY TO PLAY?</div><h2>Enter the arena</h2><p className="muted">Pick a name, create a room, or join a friend.</p>
        <label htmlFor="playerName">YOUR PLAYER NAME</label>
        <input id="playerName" maxLength={18} placeholder="e.g. CardShark" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (roomCode ? joinRoom() : createRoom())}/>
        <button className="primary full" onClick={createRoom}>＋ Create a room</button>
        <div className="or"><span/> OR JOIN FRIEND <span/></div>
        <div className="join-line"><input aria-label="Room code" placeholder="ENTER ROOM CODE" maxLength={6} value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinRoom()}/><button className="secondary" onClick={joinRoom}>Join →</button></div>
        <div className="fine-print">Free to play · No downloads · Just invite your friends</div>
      </div>
      <div className="hero-decoration decor-one">7</div><div className="hero-decoration decor-two">3</div><div className="hero-decoration decor-three">9</div>
    </section> : <section className="game-layout">
      <div className="game-heading"><div><div className="eyebrow">GAME ROOM</div><h1>{state.phase === 'lobby' ? 'The lobby' : state.phase === 'finished' ? 'Match complete!' : `Round ${state.round}`}</h1></div>
        <div className="room-chip"><span>ROOM CODE</span><strong>{state.code}</strong><button onClick={share} title="Copy invitation link">↗ Share</button></div>
      </div>
      {state.phase === 'lobby' ? <div className="lobby-grid">
        <div className="panel players-panel"><div className="panel-title"><h2>Players <span className="count">{state.players.length}</span></h2><span className="muted">Waiting for challengers</span></div>
          {state.players.map((p, i) => <div className="player-row" key={p.id}><div className={`avatar avatar-${i % 4}`}>{p.name.slice(0,1).toUpperCase()}</div><div className="player-info"><strong>{p.name}{p.id === state.hostId && <span className="host-tag">HOST</span>}</strong><small>{p.connected ? 'Connected' : 'Reconnecting…'}</small></div><span className={`ready-tag ${p.ready ? 'is-ready' : ''}`}>{p.ready ? '✓ READY' : 'NOT READY'}</span></div>)}
          <button className="secondary full share-button" onClick={share}>↗ Copy invite link</button>
        </div>
        <div className="panel rules-panel"><div className="card-kicker">HOW TO PLAY</div><h2>Sort it. Submit. Win.</h2>
          <ol className="rules"><li><b>01</b><span>Get five shuffled number cards.</span></li><li><b>02</b><span>Arrange them from lowest to highest.</span></li><li><b>03</b><span>Submit before your opponent.</span></li><li><b>04</b><span>Win three rounds to take the match.</span></li></ol>
          <button className="ready-button full" onClick={() => emit('player:ready', { ready: !me?.ready })}>{me?.ready ? '✓ You are ready — click to undo' : 'I’m ready →'}</button>
          {isHost && <button className="primary full start-button" disabled={state.players.length < 2 || !state.players.every(p => p.ready)} onClick={() => emit('game:start')}>{state.players.length < 2 ? 'Waiting for another player' : !state.players.every(p => p.ready) ? 'Waiting for everyone to ready up' : 'Start match ⚡'}</button>}
        </div>
      </div> : <>
        <div className="score-strip">{state.players.map(p => <div className={`score-card ${p.id === state.winnerId ? 'winner-card' : ''}`} key={p.id}><div className="score-avatar">{p.name.slice(0,1).toUpperCase()}</div><div className="score-player"><strong>{p.name}{p.id === state.yourId ? ' (YOU)' : ''}</strong><small>{p.submitted ? 'Answer submitted' : p.connected ? 'In the race' : 'Disconnected'}</small></div><div className="score-number">{p.score}<small>/3</small></div></div>)}</div>
        {state.phase === 'countdown' && <div className="panel center-panel"><div className="big-count">GET READY!</div><p>Cards are coming up. Prepare to sort!</p></div>}
        {state.phase === 'playing' && <div className="panel game-panel"><div className="round-meta"><span className="live-tag"><span className="pulse"/> ROUND LIVE</span><span className={`timer ${remaining < 10 ? 'urgent' : ''}`}>◷ 00:{String(remaining).padStart(2,'0')}</span></div>
          <h2>Put the numbers in <span className="brand-accent">ascending order</span></h2><p className="muted">Select two cards to swap, or drag a card to a new position.</p>
          <div className="cards" onDragOver={e => e.preventDefault()}>{cards.map((n, i) => <div className={`number-card ${selected === i ? 'selected' : ''}`} key={`${n}-${i}`} draggable onDragStart={() => setDragIndex(i)} onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)} onClick={() => swap(i)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && swap(i)}><span className="card-index">{String(i+1).padStart(2,'0')}</span><span className="card-number">{n}</span><span className="card-suit">{i % 2 ? '✦' : '◆'}</span></div>)}</div>
          <div className="game-actions"><span className="muted">Your order: <b>{cards.join(' · ') || 'Waiting for cards…'}</b></span><button className="primary submit-button" disabled={!cards.length || !!me?.submitted} onClick={() => emit('answer:submit', { cards })}>{me?.submitted ? 'Answer submitted ✓' : 'Submit answer →'}</button></div>
        </div>}
        {state.phase === 'roundResult' && <div className="panel result-panel"><div className="result-icon">{state.winnerId ? '🏆' : '⏱️'}</div><div className="eyebrow">ROUND {state.round} RESULTS</div><h2>{state.winnerName ? `${state.winnerName} wins the round!` : 'Time is up!'}</h2><p>{state.winnerName ? 'A correct sequence, submitted at just the right time.' : 'Nobody submitted a correct sequence this round.'}</p><div className="result-scores">{state.players.map(p => <span key={p.id}>{p.name}: <b>{p.score}</b></span>)}</div><p className="muted">Next round starts shortly…</p></div>}
        {state.phase === 'finished' && <div className="panel result-panel"><div className="result-icon">🏆</div><div className="eyebrow">MATCH CHAMPION</div><h2>{state.winnerName} wins the match!</h2><p>First to three rounds. Nicely played.</p><div className="result-scores">{state.players.map(p => <span key={p.id}>{p.name}: <b>{p.score}</b></span>)}</div><button className="primary" onClick={() => emit('game:rematch')}>Play again ↻</button><button className="text-button" onClick={() => { emit('room:leave'); setState(null); }}>Leave room</button></div>}
      </>}
      {state && <div className="social-grid">
        <div className="panel chat-panel"><div className="panel-title"><h2>Room chat</h2><span className="muted">Talk with your opponents</span></div>
          <div className="chat-feed" aria-live="polite">{chatMessages.length ? chatMessages.map(message => <div className="chat-message" key={message.id}><strong>{message.name}</strong><span>{message.text}</span><small>{new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>) : <p className="muted chat-empty">No messages yet. Say hello!</p>}</div>
          <form className="chat-form" onSubmit={sendChat}><input aria-label="Chat message" maxLength={180} placeholder="Type a message…" value={chatDraft} onChange={e => setChatDraft(e.target.value)} disabled={!socket?.connected}/><button className="primary" type="submit" disabled={!chatDraft.trim()}>Send</button></form>
        </div>
        <div className="panel reactions-panel"><div className="card-kicker">QUICK REACTIONS</div><h2>Show your spirit</h2><p className="muted">Send a reaction to everyone in the room.</p><div className="reaction-buttons">{['👏','😂','😈','🔥','😮','💪'].map(emoji => <button key={emoji} onClick={() => emit('room:reaction', { emoji })} aria-label={`Send ${emoji} reaction`}>{emoji}</button>)}</div><div className="reaction-feed" aria-live="polite">{reactions.map(reaction => <span key={reaction.id} title={reaction.name}>{reaction.emoji} <small>{reaction.name}</small></span>)}</div></div>
      </div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}
      <footer className="game-footer"><span>⚡ SPEED SORTING</span><span>Think fast. Sort faster.</span></footer>
    </section>}
    {!state && notice && <div className="global-notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <footer className="site-footer"><span>© SPEED SORTING</span><span>Made for friendly competition</span><span>NO LUCK. JUST SPEED.</span></footer>
  </main>;
}
export default App;
