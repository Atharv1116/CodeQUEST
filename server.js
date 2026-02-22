
// server.js - Enhanced CodeQuest Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const app = express();
app.set('trust proxy', 1);
const helmet = require('helmet');
const mongoose = require('mongoose');
const authenticateToken = require('./middleware/authenticateToken');


// Database & Models
const connectDB = require('./config/database');
const User = require('./models/User');
const Question = require('./models/Question');
const Match = require('./models/Match');
const CustomRoom = require('./models/CustomRoom');

// Utils & Services
const { submitToJudge0, LANGUAGE_IDS } = require('./config/judge0');
const { run1v1Pipeline, run2v2Pipeline, runBattleRoyalePipeline } = require('./utils/ratingPipeline');
const { calculateXP, calculateCoins, checkBadges } = require('./utils/gamification');
const { getAIFeedback, getHint, recommendProblems, analyzePostMatch } = require('./services/aiTutor');

// Routes
const authRoutes = require('./routes/auth');
const apiRouter = require('./routes/api');
const aiTutorRouter = require('./routes/aiTutor');


const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      'https://deployment-3yen98p15-atharvanikhade94-7076s-projects.vercel.app',
      'https://deployment-iota-jet.vercel.app',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://127.0.0.1:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://deployment-3yen98p15-atharvanikhade94-7076s-projects.vercel.app',
    'https://deployment-iota-jet.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes

app.use('/api/auth', authRoutes);
app.use('/api', apiRouter);
app.use('/api/ai-tutor', aiTutorRouter);
app.use('/api/custom-rooms', require('./routes/customRooms'));

// Code evaluation endpoint
app.post('/api/evaluate', async (req, res) => {
  try {
    const { code, language_id, input, expected_output } = req.body;
    const result = await submitToJudge0({
      source_code: code,
      language_id,
      stdin: input || '',
      expected_output
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Code evaluation failed', message: err.message });
  }
});

// Question recovery endpoint - allows clients to fetch question if socket event is missed
app.get('/api/match/:roomId/question', authenticateToken, async (req, res) => {
  const { roomId } = req.params;

  try {
    const question = roomQuestion.get(roomId);
    if (question) return res.json({ ok: true, question });

    const match = await Match.findOne({ roomId }).populate('question');
    if (match && match.question) return res.json({ ok: true, question: match.question });

    res.status(404).json({ ok: false, error: 'Question not found for this match' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Match state recovery for reconnecting players
app.get('/api/match/:roomId/state', authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.userId;

  try {
    const state = roomState.get(roomId);
    const question = roomQuestion.get(roomId);

    if (!state) {
      // Match is finished — return basic info from DB
      const match = await Match.findOne({ roomId }).populate('question');
      if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
      return res.json({
        ok: true, status: 'finished',
        type: match.type, question: match.question,
        timerRemaining: 0, editorLocked: true
      });
    }

    const timerRemaining = state.timerEndAt
      ? Math.max(0, Math.ceil((state.timerEndAt - Date.now()) / 1000))
      : (state.timerDuration || MATCH_TIME_LIMIT_SECONDS);

    const socketId = (await User.findById(userId, 'socketId').lean())?.socketId;
    const myAttempts = state.playerAttempts?.[socketId] || 0;

    res.json({
      ok: true, status: state.finished ? 'finished' : 'active',
      type: state.type, question,
      timerRemaining,
      timerDuration: state.timerDuration || MATCH_TIME_LIMIT_SECONDS,
      players: state.players,
      playerIds: state.playerIds,
      myAttempts,
      editorLocked: !!state.finished
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Post-match AI analysis endpoint
app.get('/api/match/:matchId/ai-analysis', authenticateToken, async (req, res) => {
  const { matchId } = req.params;
  const userId = req.userId;

  try {
    const match = await Match.findById(matchId).populate('question');
    if (!match) return res.status(404).json({ ok: false, error: 'Match not found' });
    if (match.status !== 'finished') return res.status(400).json({ ok: false, error: 'Match not finished yet' });

    const user = await User.findById(userId).lean();
    const userResult = match.results?.find(r => r.player?.toString() === userId);

    const analysis = await analyzePostMatch({
      match: {
        type: match.type,
        question: match.question,
        submissionLog: match.submissionLog,
        analytics: match.analytics,
        userResult
      },
      user
    });

    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('[AI Analysis] Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/match/:roomId/forfeit', authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const forfeitingUserId = req.userId;

  try {
    await handleMatchForfeit(roomId, forfeitingUserId);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Connect to MongoDB
connectDB();

// ---------- In-memory game state ----------
let queue1v1 = [];
let queue2v2 = [];
let queueBattleRoyale = [];
const roomQuestion = new Map();
const roomState = new Map();
const playerSessions = new Map(); // socketId -> userId
const submissionLocks = new Set(); // socketId — locked while Judge0 evaluates

// Server-authoritative timer config
const MATCH_TIME_LIMIT_SECONDS = 1800; // 30 min for 1v1/2v2
const BATTLE_ROYALE_ROUND_SECONDS = 300;  // 5 min per round

// ---------- Server-Side Timer Authority ----------
function startMatchTimer(roomId, durationSeconds) {
  const state = roomState.get(roomId);
  if (!state) return;

  state.timerEndAt = Date.now() + durationSeconds * 1000;
  state.timerDuration = durationSeconds;
  state.timerInterval = setInterval(async () => {
    const s = roomState.get(roomId);
    if (!s || s.finished) {
      clearInterval(s?.timerInterval);
      return;
    }
    const remaining = Math.max(0, Math.ceil((s.timerEndAt - Date.now()) / 1000));
    io.to(roomId).emit('timer-tick', { remaining, roomId });

    if (remaining <= 0) {
      clearInterval(s.timerInterval);
      await handleTimerExpiry(roomId);
    }
  }, 1000);
  roomState.set(roomId, state);
}

function stopMatchTimer(roomId) {
  const state = roomState.get(roomId);
  if (state?.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

async function handleTimerExpiry(roomId) {
  const state = roomState.get(roomId);
  if (!state || state.finished) return;

  console.log(`[Timer] Match timed out: ${roomId}`);
  state.finished = true;
  roomState.set(roomId, state);

  io.to(roomId).emit('match-locked', { roomId, reason: 'timeout' });

  const question = roomQuestion.get(roomId);
  const matchDurationMs = (state.timerDuration || MATCH_TIME_LIMIT_SECONDS) * 1000;

  if (state.type === '1v1') {
    // Determine if anyone solved — if not, draw
    const hasSolver = state.submittedPlayers && state.submittedPlayers.length > 0;
    if (!hasSolver) {
      // Draw
      const [uid1, uid2] = state.playerIds;
      let ratingChanges = [];
      try {
        const savedMatch = await Match.create({
          roomId, type: '1v1', players: state.playerIds,
          question: question?._id, status: 'finished', endReason: 'timeout',
          startedAt: state.startedAt, finishedAt: new Date(),
          timerDurationSeconds: state.timerDuration
        });
        ratingChanges = await run1v1Pipeline({
          matchId: savedMatch._id, winnerUserId: uid1, loserUserId: uid2,
          isDraw: true, winnerAttempts: 0, loserAttempts: 0,
          matchDurationMs, question
        });
      } catch (e) { console.error('[Timer] Draw pipeline error:', e.message); }

      io.to(roomId).emit('match-finished', {
        roomId, draw: true, reason: 'timeout',
        message: "⏰ Time's up! It's a draw.",
        ratingChanges
      });
    } else {
      // Someone already won via submit — nothing more to do
      console.log(`[Timer] ${roomId} already resolved by submission.`);
    }
  } else if (state.type === '2v2') {
    // Draw for team matches on timeout
    io.to(roomId).emit('match-finished', {
      roomId, draw: true, reason: 'timeout',
      message: "⏰ Time's up! Match ended in a draw.",
      ratingChanges: []
    });
  } else if (state.type === 'battle-royale') {
    // End current round
    await endBattleRoyaleRound(roomId, state.round || 1, true);
  }

  roomState.delete(roomId);
  roomQuestion.delete(roomId);
}

// Helper: Get random question
async function getRandomQuestion(difficulty = null) {
  try {
    const query = difficulty ? { difficulty } : {};
    const q = await Question.aggregate([
      { $match: query },
      { $sample: { size: 1 } }
    ]);

    if (!q || q.length === 0) {
      console.warn(`⚠️ No questions found in database${difficulty ? ` for difficulty: ${difficulty}` : ''}. Using fallback question.`);
      return {
        title: 'Default Problem',
        description: 'Solve this problem',
        sampleInput: 'test',
        sampleOutput: 'test',
        difficulty: difficulty || 'easy',
        _id: null
      };
    }

    console.log(`✅ Question loaded: "${q[0].title}" (${q[0].difficulty})`);
    return q[0];
  } catch (error) {
    console.error('❌ Error loading question from database:', error.message);
    return {
      title: 'Default Problem',
      description: 'Solve this problem',
      sampleInput: 'test',
      sampleOutput: 'test',
      difficulty: difficulty || 'easy',
      _id: null
    };
  }
}

// Helper: Update user socket mapping
async function updateUserSocket(userId, socketId) {
  await User.findByIdAndUpdate(userId, { socketId });
  playerSessions.set(socketId, userId);
}

async function handleMatchForfeit(roomId, forfeitingUserId) {
  const state = roomState.get(roomId);
  if (!state || state.finished) {
    throw new Error('Match is no longer active.');
  }

  const playerIds = (state.playerIds || []).map((id) => id?.toString());
  const normalizedLoser = forfeitingUserId?.toString();

  if (!playerIds.includes(normalizedLoser)) {
    throw new Error('You are not part of this match.');
  }

  const winnerIds = playerIds.filter((id) => id !== normalizedLoser);
  if (winnerIds.length === 0) {
    throw new Error('No opponent to award.');
  }

  const difficulty = state.type === 'battle-royale' ? 'medium' : 'easy';
  const mode = state.type || '1v1';

  const loser = await User.findById(forfeitingUserId);
  if (loser) {
    loser.losses += 1;
    loser.matches += 1;
    loser.xp += calculateXP('loss', difficulty, mode);
    loser.coins += calculateCoins('loss', difficulty, mode);
    loser.streak = 0;
    await loser.save();
  }

  const winners = await User.find({ _id: { $in: winnerIds } });
  for (const winner of winners) {
    winner.wins += 1;
    winner.matches += 1;
    winner.xp += calculateXP('win', difficulty, mode);
    winner.coins += calculateCoins('win', difficulty, mode);
    winner.streak += 1;
    winner.longestStreak = Math.max(winner.longestStreak, winner.streak);
    await checkBadges(winner, require('./models/Badge'));
    await winner.save();
  }

  const question = roomQuestion.get(roomId);
  try {
    await Match.create({
      roomId,
      type: mode,
      players: playerIds,
      question: question?._id || null,
      winner: winners[0]?._id || null,
      winners: winnerIds,
      status: 'finished',
      startedAt: state.startedAt || new Date(),
      finishedAt: new Date(),
      results: playerIds.map((id) => ({
        player: id,
        solved: winnerIds.includes(id),
        timeTaken: null,
        attempts: 0,
        score: winnerIds.includes(id) ? 100 : 0
      }))
    });
  } catch (error) {
    console.warn('Forfeit match record skipped:', error.message);
  }

  state.finished = true;
  roomState.delete(roomId);
  roomQuestion.delete(roomId);

  io.to(roomId).emit('match-forfeited', {
    roomId,
    forfeitingUserId,
    winners: winnerIds
  });
}

// ---------- Socket.IO Handlers ----------
io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Authenticate socket
  socket.on('authenticate', async ({ token, userId }) => {
    try {
      if (userId) {
        await updateUserSocket(userId, socket.id);
        socket.emit('authenticated', { success: true });
      }
    } catch (error) {
      socket.emit('authenticated', { success: false, error: error.message });
    }
  });

  socket.on('player_left_match', (payload = {}) => {
    if (!payload.roomId) return;
    io.to(payload.roomId).emit('player-left-match', payload);
  });


  // -------- join-room: re-join socket to an existing match room --------
  // Battle.jsx emits this on mount. Without this handler the socket is NOT in
  // the Socket.IO room and io.to(roomId).emit() delivers to nobody.
  socket.on('join-room', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`[Server] Socket ${socket.id} joined room ${roomId}`);

    // If there is active match state, send it so the client can recover
    const state = roomState.get(roomId);
    const question = roomQuestion.get(roomId);
    if (state && question) {
      const timerEndAt = state.timerEndAt || null;
      const timerRemaining = timerEndAt
        ? Math.max(0, Math.round((timerEndAt - Date.now()) / 1000))
        : null;
      socket.emit('room-state', {
        roomId,
        type: state.type,
        question,
        timerRemaining,
        editorLocked: state.finished || false
      });
    }
  });

  // ---------- 1v1 Matchmaking ----------
  socket.on('join-1v1', async () => {
    if (!queue1v1.find(s => s.id === socket.id)) {
      queue1v1.push(socket);
    }

    if (queue1v1.length >= 2) {
      const [player1, player2] = queue1v1.splice(0, 2);
      const roomId = `room_1v1_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      [player1, player2].forEach(p => p.join(roomId));

      const question = await getRandomQuestion();
      roomQuestion.set(roomId, question);

      const state = {
        type: '1v1',
        players: [player1.id, player2.id],
        playerIds: [],
        submittedPlayers: [],
        finished: false,
        startedAt: new Date()
      };
      roomState.set(roomId, state);

      // Get user IDs
      const userId1 = playerSessions.get(player1.id);
      const userId2 = playerSessions.get(player2.id);
      if (userId1) state.playerIds.push(userId1);
      if (userId2) state.playerIds.push(userId2);

      console.log(`[Server] 1v1 Match created - Room: ${roomId}, Players: ${player1.id}, ${player2.id}`);
      console.log(`[Server] Question: ${question.title}`);

      // Emit match-found to both players
      const matchPayload = {
        roomId,
        players: [player1.id, player2.id],
        type: '1v1',
        question,
        timerDuration: MATCH_TIME_LIMIT_SECONDS
      };
      player1.emit('match-found', matchPayload);
      player2.emit('match-found', matchPayload);

      // Start server-authoritative timer AFTER emitting match-found
      startMatchTimer(roomId, MATCH_TIME_LIMIT_SECONDS);
      console.log(`[Server] Timer started for room ${roomId} (${MATCH_TIME_LIMIT_SECONDS}s)`);
    } else {
      socket.emit('queued', { mode: '1v1', queueSize: queue1v1.length });
    }
  });

  // ---------- 2v2 Matchmaking ----------
  // Deterministic team assignment:
  // Players 1-2 → Team Blue (complete when 2nd joins)
  // Players 3-4 → Team Red (complete when 4th joins, match starts)
  socket.on('join-2v2', async () => {
    // Prevent joining multiple queues
    if (queue1v1.find(s => s.id === socket.id) ||
      queueBattleRoyale.find(s => s.id === socket.id)) {
      socket.emit('queue-error', { message: 'Already in another queue' });
      return;
    }

    // Add to queue if not already present
    if (!queue2v2.find(s => s.id === socket.id)) {
      queue2v2.push(socket);
    }

    const queueSize = queue2v2.length;
    const teamBlueSize = Math.min(2, queueSize);
    const teamRedSize = Math.max(0, Math.min(2, queueSize - 2));

    // Emit queue status updates to all players in queue
    queue2v2.forEach((p, idx) => {
      const position = idx + 1;
      let team = null;
      let teamStatus = null;

      if (position <= 2) {
        team = 'blue';
        teamStatus = teamBlueSize === 2 ? 'complete' : 'waiting';
      } else if (position <= 4) {
        team = 'red';
        teamStatus = teamRedSize === 2 ? 'complete' : 'waiting';
      }

      p.emit('queued', {
        mode: '2v2',
        queueSize,
        position,
        team,
        teamStatus,
        teamBlueSize,
        teamRedSize
      });
    });

    // Start match when both teams are complete (4 players)
    if (queueSize >= 4) {
      const players = queue2v2.splice(0, 4);
      const roomId = `room_2v2_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      players.forEach(p => p.join(roomId));

      // Deterministic assignment: Players 1-2 → Blue, Players 3-4 → Red
      const teamBlue = [players[0].id, players[1].id];
      const teamRed = [players[2].id, players[3].id];

      const question = await getRandomQuestion();
      roomQuestion.set(roomId, question);

      const state = {
        type: '2v2',
        players: [...teamBlue, ...teamRed],
        playerIds: [],
        teams: { blue: teamBlue, red: teamRed },
        teamIds: { blue: [], red: [] },
        submittedPlayers: [],
        finished: false,
        startedAt: new Date()
      };
      roomState.set(roomId, state);

      // Map user IDs
      players.forEach((p, idx) => {
        const userId = playerSessions.get(p.id);
        if (userId) {
          state.playerIds.push(userId);
          if (idx < 2) {
            state.teamIds.blue.push(userId);
          } else {
            state.teamIds.red.push(userId);
          }
        }
      });

      // Emit match-found with team information
      players.forEach(p => {
        const isBlue = teamBlue.includes(p.id);
        const team = isBlue ? 'blue' : 'red';
        const teammates = isBlue ? teamBlue : teamRed;
        const opponents = isBlue ? teamRed : teamBlue;

        p.emit('match-found', {
          roomId,
          type: '2v2',
          team,
          teammates,
          opponents,
          question,
          timerDuration: MATCH_TIME_LIMIT_SECONDS
        });
      });

      // Start server-authoritative timer
      startMatchTimer(roomId, MATCH_TIME_LIMIT_SECONDS);
      console.log(`[Server] Timer started for 2v2 room ${roomId} (${MATCH_TIME_LIMIT_SECONDS}s)`);
    }
  });

  // ---------- Battle Royale Matchmaking ----------
  socket.on('join-battle-royale', async () => {
    if (!queueBattleRoyale.find(s => s.id === socket.id)) {
      queueBattleRoyale.push(socket);
    }

    // Start game when we have minimum players or after 30 seconds with at least 2 players
    const shouldStart = queueBattleRoyale.length >= BATTLE_ROYALE_MIN_PLAYERS ||
      (queueBattleRoyale.length >= 2 && !roomState.has('battle-royale-waiting'));

    if (shouldStart) {
      const players = queueBattleRoyale.splice(0, Math.min(queueBattleRoyale.length, BATTLE_ROYALE_MAX_PLAYERS));
      const roomId = `room_br_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      players.forEach(p => p.join(roomId));

      const question = await getRandomQuestion('medium');
      roomQuestion.set(roomId, question);

      const state = {
        type: 'battle-royale',
        players: players.map(p => p.id),
        playerIds: [],
        scores: new Map(), // socketId -> { solved: bool, time: number, attempts: number }
        eliminated: [],
        round: 1,
        finished: false,
        startedAt: new Date()
      };
      roomState.set(roomId, state);

      // Initialize scores
      players.forEach(p => {
        state.scores.set(p.id, { solved: false, time: null, attempts: 0 });
        const userId = playerSessions.get(p.id);
        if (userId) state.playerIds.push(userId);
      });

      io.to(roomId).emit('match-found', {
        roomId,
        type: 'battle-royale',
        players: state.players,
        question,
        round: 1,
        totalRounds: 3,
        timerDuration: BATTLE_ROYALE_ROUND_SECONDS
      });

      // Start first round timer
      startMatchTimer(roomId, BATTLE_ROYALE_ROUND_SECONDS);
    } else {
      socket.emit('queued', { mode: 'battle-royale', queueSize: queueBattleRoyale.length });
    }
  });

  // Battle Royale round logic
  function startBattleRoyaleRound(roomId, round) {
    const state = roomState.get(roomId);
    if (!state || state.finished) return;

    io.to(roomId).emit('battle-royale-round-start', {
      round,
      timeLimit: BATTLE_ROYALE_ROUND_TIME / 1000,
      question: roomQuestion.get(roomId)
    });

    // End round after time limit
    setTimeout(() => {
      endBattleRoyaleRound(roomId, round);
    }, BATTLE_ROYALE_ROUND_TIME);
  }

  async function endBattleRoyaleRound(roomId, round) {
    const state = roomState.get(roomId);
    if (!state || state.finished) return;

    // Get players sorted by score (solved first, then by time)
    const players = Array.from(state.scores.entries())
      .filter(([id]) => !state.eliminated.includes(id))
      .sort((a, b) => {
        if (a[1].solved !== b[1].solved) return b[1].solved - a[1].solved;
        if (a[1].solved && b[1].solved) {
          return (a[1].time || Infinity) - (b[1].time || Infinity);
        }
        return b[1].attempts - a[1].attempts; // More attempts = worse
      });

    // Eliminate bottom players
    const eliminateCount = Math.max(1, Math.floor(players.length * BATTLE_ROYALE_ELIMINATION_RATE));
    const eliminated = players.slice(-eliminateCount).map(([id]) => id);

    state.eliminated.push(...eliminated);
    state.round = round + 1;

    // Emit elimination
    io.to(roomId).emit('battle-royale-eliminations', {
      eliminated,
      round,
      remaining: players.length - eliminateCount
    });

    // Check if game should end
    const remaining = players.length - eliminateCount;
    if (remaining <= 1 || round >= 3) {
      // Game over
      const winner = players[0] ? players[0][0] : null;
      await finishBattleRoyale(roomId, winner);
    } else {
      // Next round
      const nextQuestion = await getRandomQuestion('medium');
      roomQuestion.set(roomId, nextQuestion);

      // Reset scores for next round
      state.scores.forEach((score, id) => {
        if (!state.eliminated.includes(id)) {
          state.scores.set(id, { solved: false, time: null, attempts: 0 });
        }
      });

      setTimeout(() => {
        startBattleRoyaleRound(roomId, round + 1);
      }, 5000); // 5 second break between rounds
    }
  }

  async function finishBattleRoyale(roomId, winnerSocketId) {
    const state = roomState.get(roomId);
    if (!state) return;

    state.finished = true;

    // Calculate final rankings
    const rankings = Array.from(state.scores.entries())
      .map(([socketId, score]) => ({
        socketId,
        userId: state.playerIds[state.players.indexOf(socketId)],
        solved: score.solved,
        time: score.time,
        attempts: score.attempts,
        position: state.eliminated.indexOf(socketId) === -1
          ? (state.eliminated.length + 1)
          : state.eliminated.indexOf(socketId) + 1
      }))
      .sort((a, b) => {
        if (a.solved !== b.solved) return b.solved - a.solved;
        if (a.solved && b.solved) return (a.time || Infinity) - (b.time || Infinity);
        return a.position - b.position;
      });

    const winnerUserId = rankings[0]?.userId;

    // Update user stats and ELO
    for (const ranking of rankings) {
      if (!ranking.userId) continue;

      const user = await User.findById(ranking.userId);
      if (!user) continue;

      const isWinner = ranking.userId === winnerUserId;
      const position = rankings.indexOf(ranking) + 1;

      // Update stats
      if (isWinner) {
        user.wins += 1;
      } else {
        user.losses += 1;
      }
      user.matches += 1;

      // Calculate XP and coins
      const xp = calculateXP(isWinner ? 'win' : 'loss', 'medium', 'battle-royale');
      const coins = calculateCoins(isWinner ? 'win' : 'loss', 'medium', 'battle-royale', position);

      user.xp += xp;
      user.coins += coins;

      // Update streak
      if (isWinner) {
        user.streak += 1;
        user.longestStreak = Math.max(user.longestStreak, user.streak);
        user.lastPlayDate = new Date();
      } else {
        user.streak = 0;
      }

      // Check badges
      await checkBadges(user, require('./models/Badge'));

      await user.save();
    }

    // Save match
    await Match.create({
      roomId,
      type: 'battle-royale',
      players: state.playerIds,
      playerSocketIds: state.players,
      question: roomQuestion.get(roomId)?._id,
      winner: winnerUserId,
      winners: winnerUserId ? [winnerUserId] : [],
      results: rankings.map(r => ({
        player: r.userId,
        solved: r.solved,
        timeTaken: r.time,
        attempts: r.attempts,
        score: r.solved ? (1000 - (r.time || 0) / 100) : 0
      })),
      status: 'finished',
      startedAt: state.startedAt,
      finishedAt: new Date()
    });

    io.to(roomId).emit('battle-royale-finished', {
      winner: winnerSocketId,
      winnerUserId,
      rankings: rankings.map(r => ({
        socketId: r.socketId,
        position: rankings.indexOf(r) + 1,
        solved: r.solved,
        time: r.time
      }))
    });
  }

  // Join room
  socket.on('join-room', (roomId) => {
    console.log(`[Server] ${socket.id} joining room:`, roomId);
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);

    // Send complete match data to player joining the room
    const question = roomQuestion.get(roomId);
    const state = roomState.get(roomId);

    console.log(`[Server] Room ${roomId} - Question exists:`, !!question, 'State exists:', !!state);

    if (question && state) {
      const matchData = {
        roomId,
        question,
        type: state.type || '1v1',
        // Include team info for 2v2
        team: state.teams?.blue?.includes(socket.id) ? 'blue' :
          state.teams?.red?.includes(socket.id) ? 'red' : null,
        teammates: state.teams?.blue?.includes(socket.id) ? state.teams.blue :
          state.teams?.red?.includes(socket.id) ? state.teams.red : [],
        opponents: state.teams?.blue?.includes(socket.id) ? state.teams.red :
          state.teams?.red?.includes(socket.id) ? state.teams.blue : []
      };
      console.log(`[Server] Sending match-found to ${socket.id} with question:`, question.title);
      socket.emit('match-found', matchData);
    } else {
      console.error(`[Server] Cannot send match data - Question: ${!!question}, State: ${!!state}`);
    }
  });

  // Chat - broadcast to room including sender
  socket.on('send-message', async ({ roomId, message }) => {
    const userId = playerSessions.get(socket.id);
    let username = socket.id.substring(0, 8); // Default to socket ID

    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) username = user.username;
      } catch (err) {
        console.error('Error fetching user for chat:', err);
      }
    }

    // Broadcast to entire room including sender
    io.to(roomId).emit('receive-message', {
      user: username,
      socketId: socket.id,
      message
    });
  });

  // Timer expiry - auto-submit code for all players
  // Note: Client should send code via submit-code when timer expires
  // This handler is a fallback for cases where client can't send code
  socket.on('timer-expired', async ({ roomId, code, language_id }) => {
    const state = roomState.get(roomId);
    if (!state || state.finished) return;

    const question = roomQuestion.get(roomId);
    if (!question) return;

    // Use provided code or empty string
    const playerCode = code || '# No code submitted';
    const langId = language_id || 71; // Default to Python

    try {
      const judgeRes = await submitToJudge0({
        source_code: playerCode,
        language_id: langId,
        stdin: question.sampleInput || '',
        expected_output: question.sampleOutput || ''
      });

      const stdout = (judgeRes.stdout || '').trim();
      const expected = (question.sampleOutput || '').trim();
      const correct = stdout === expected;

      // Emit result to player
      socket.emit('evaluation-result', {
        ok: true,
        correct,
        details: {
          status: judgeRes.status?.description,
          stdout,
          stderr: judgeRes.stderr,
          compile_output: judgeRes.compile_output,
          time: judgeRes.time,
          memory: judgeRes.memory,
          correct,
          autoSubmitted: true
        }
      });

      // If correct, handle win normally
      if (correct) {
        const submitTime = Date.now() - (state.startedAt?.getTime() || Date.now());
        if (state.type === '1v1') {
          await handle1v1Win(roomId, socket.id, state, question, { correct: true }, submitTime);
        } else if (state.type === '2v2') {
          await handle2v2Win(roomId, socket.id, state, question, { correct: true }, submitTime);
        }
      }
    } catch (err) {
      console.error('Timer expiry auto-submit error:', err);
      socket.emit('evaluation-result', {
        ok: false,
        message: 'Auto-submission failed due to timer expiry'
      });
    }
  });

  // Leave match
  socket.on('leave-match', async ({ roomId, reason }) => {
    const state = roomState.get(roomId);
    if (!state || state.finished) return;

    const leavingUserId = playerSessions.get(socket.id);
    const remainingPlayers = state.players.filter(id => id !== socket.id);

    if (state.type === '1v1' && remainingPlayers.length === 1) {
      const winnerId = remainingPlayers[0];
      const winnerUserId = state.playerIds.find((id, idx) =>
        state.players[idx] === winnerId
      ) || playerSessions.get(winnerId);

      state.finished = true;
      state.winner = winnerId;
      roomState.set(roomId, state);

      // Update winner stats
      if (winnerUserId) {
        try {
          const winner = await User.findById(winnerUserId);
          if (winner) {
            winner.wins += 1;
            winner.matches += 1;
            winner.xp += calculateXP('win', 'easy', '1v1');
            winner.coins += calculateCoins('win', 'easy', '1v1');
            await winner.save();
          }
        } catch (err) {
          console.error('Error updating winner stats:', err);
        }
      }

      // Notify winner
      io.to(winnerId).emit('opponent-left-match');
      io.to(winnerId).emit('match-finished', {
        roomId,
        winner: 'you',
        message: 'Opponent left the match. You win!',
        reason: 'opponent-left'
      });
    } else if (state.type === '2v2') {
      // Determine which team the leaving player belongs to
      const isBlue = state.teams.blue && state.teams.blue.includes(socket.id);
      const leavingTeam = isBlue ? 'blue' : 'red';
      const winningTeam = isBlue ? 'red' : 'blue';
      const winningTeamIds = state.teamIds[winningTeam];
      const losingTeamIds = state.teamIds[leavingTeam];

      state.finished = true;
      state.winnerTeam = winningTeam;
      roomState.set(roomId, state);

      const question = roomQuestion.get(roomId);
      const difficulty = question?.difficulty || 'easy';

      // Update winners (opposing team)
      if (winningTeamIds && winningTeamIds.length > 0) {
        try {
          const winners = await User.find({ _id: { $in: winningTeamIds } });
          for (const winner of winners) {
            winner.wins += 1;
            winner.matches += 1;
            winner.xp += calculateXP('win', difficulty, '2v2');
            winner.coins += calculateCoins('win', difficulty, '2v2');
            winner.streak += 1;
            await checkBadges(winner, require('./models/Badge'));
            await winner.save();
          }
        } catch (err) {
          console.error('Error updating winner stats:', err);
        }
      }

      // Update losers (leaving player's team)
      if (losingTeamIds && losingTeamIds.length > 0) {
        try {
          const losers = await User.find({ _id: { $in: losingTeamIds } });
          for (const loser of losers) {
            loser.losses += 1;
            loser.matches += 1;
            loser.xp += calculateXP('loss', difficulty, '2v2');
            loser.streak = 0;
            await loser.save();
          }
        } catch (err) {
          console.error('Error updating loser stats:', err);
        }
      }

      // Save match record
      try {
        await Match.create({
          roomId,
          type: '2v2',
          players: [...winningTeamIds, ...losingTeamIds],
          playerSocketIds: [...state.teams[winningTeam], ...state.teams[leavingTeam]],
          question: question?._id || null,
          winnerTeam: winningTeam,
          results: [
            ...winningTeamIds.map(id => ({ player: id, solved: true, score: 100 })),
            ...losingTeamIds.map(id => ({ player: id, solved: false, score: 0 }))
          ],
          status: 'finished',
          startedAt: state.startedAt,
          finishedAt: new Date()
        });
      } catch (err) {
        console.warn('Error saving match record:', err.message);
      }

      // Notify winning team
      state.teams[winningTeam].forEach(winnerSocketId => {
        io.to(winnerSocketId).emit('opponent-left-match');
        io.to(winnerSocketId).emit('match-finished', {
          roomId,
          winnerTeam: winningTeam,
          message: `Opposing team left. Team ${winningTeam} wins!`,
          reason: 'opponent-left'
        });
      });

      // Notify losing team
      state.teams[leavingTeam].forEach(loserSocketId => {
        if (loserSocketId !== socket.id) {
          io.to(loserSocketId).emit('match-finished', {
            roomId,
            winnerTeam: winningTeam,
            message: `A teammate left. Team ${winningTeam} wins!`,
            reason: 'teammate-left'
          });
        }
      });
    }

    // Notify the leaving player
    socket.emit('you-left-match');
  });

  // Request hint
  socket.on('request-hint', async ({ roomId }) => {
    const question = roomQuestion.get(roomId);
    if (question) {
      const hint = await getHint(question, {});
      socket.emit('hint-received', { hint });
    }
  });

  // -------- SUBMISSION ENGINE — Server Authority --------
  // Run: unlimited attempts on sample test cases, no state change
  // Submit: hidden test cases, submission locking, atomic win check
  socket.on('submit-code', async ({ roomId, code, language_id, inputOverride, isSubmit = true }) => {
    try {
      const state = roomState.get(roomId);
      const question = roomQuestion.get(roomId);

      if (!state || !question) {
        socket.emit('evaluation-result', { ok: false, message: 'Room or question not found' });
        return;
      }

      // --- GATE 1: match already finished ---
      if (state.finished) {
        socket.emit('evaluation-result', { ok: false, message: 'Match has already ended' });
        return;
      }

      // --- GATE 2: timer expired (late submission) ---
      if (isSubmit && state.timerEndAt && Date.now() > state.timerEndAt) {
        socket.emit('evaluation-result', { ok: false, message: 'Submission rejected — time limit exceeded' });
        return;
      }

      // --- RUN (not Submit): use sample I/O, no locks, no state change ---
      if (!isSubmit) {
        socket.emit('evaluation-started', { message: 'Running on sample tests...' });
        const judgeRes = await submitToJudge0({
          source_code: code,
          language_id,
          stdin: inputOverride !== undefined ? String(inputOverride) : (question.sampleInput || ''),
          expected_output: question.sampleOutput || ''
        });
        const stdout = (judgeRes.stdout || '').trim();
        const correct = stdout === (question.sampleOutput || '').trim();
        const details = {
          status: judgeRes.status?.description,
          stdout, stderr: judgeRes.stderr,
          compile_output: judgeRes.compile_output,
          time: judgeRes.time, memory: judgeRes.memory, correct
        };
        socket.emit('evaluation-result', { ok: true, correct, details, isRun: true });
        if (!correct) {
          const userId = playerSessions.get(socket.id);
          if (userId) {
            const errorMsg = judgeRes.stderr || judgeRes.compile_output || 'Wrong output';
            const feedback = await getAIFeedback(code, question, errorMsg, 0);
            socket.emit('ai-feedback', { feedback });
          }
        }
        return;
      }

      // --- GATE 3: per-player submission lock (prevent double-submit spam) ---
      if (submissionLocks.has(socket.id)) {
        socket.emit('evaluation-result', { ok: false, message: 'Evaluation already in progress — please wait' });
        return;
      }

      // Record precise server-side timestamp
      const submitTimestamp = Date.now();
      const submitTimeMs = submitTimestamp - (state.startedAt?.getTime?.() || submitTimestamp);

      // Initialize per-player attempt tracking
      if (!state.playerAttempts) state.playerAttempts = {};
      if (!state.playerAttempts[socket.id]) state.playerAttempts[socket.id] = 0;

      // --- LOCK ---
      submissionLocks.add(socket.id);
      socket.emit('evaluation-started', { message: 'Evaluating on hidden tests...' });

      let judgeRes;
      try {
        // Use hidden test cases if available, otherwise fall back to sample I/O
        const hiddenTests = question.testCases?.filter(tc => tc.isHidden);
        const useHidden = hiddenTests && hiddenTests.length > 0;
        const stdin = useHidden ? hiddenTests[0].input : (question.sampleInput || '');
        const expected = useHidden ? hiddenTests[0].output : (question.sampleOutput || '');

        judgeRes = await submitToJudge0({
          source_code: code,
          language_id,
          stdin,
          expected_output: expected
        });
      } finally {
        // Always unlock, even if Judge0 throws
        submissionLocks.delete(socket.id);
      }

      // Safety guard — if Judge0 threw and judgeRes is still undefined, bail cleanly
      if (!judgeRes) {
        socket.emit('evaluation-result', { ok: false, message: 'Code execution service unavailable. Please try again.' });
        return;
      }

      const stdout = (judgeRes.stdout || '').trim();
      const expectedOut = (question.sampleOutput || '').trim();  // renamed: no conflict with inner `expected`
      const correct = judgeRes.correct === true || stdout === expectedOut;

      const details = {
        status: judgeRes.status?.description,
        stdout, stderr: judgeRes.stderr,
        compile_output: judgeRes.compile_output,
        time: judgeRes.time, memory: judgeRes.memory, correct
      };

      // Log this attempt
      state.playerAttempts[socket.id] += 1;
      const attemptNum = state.playerAttempts[socket.id];

      // Record to submissionLog
      if (!state.submissionLog) state.submissionLog = [];
      const userId = playerSessions.get(socket.id);
      state.submissionLog.push({
        socketId: socket.id, userId, attempt: attemptNum,
        timestamp: new Date(submitTimestamp), correct,
        timeTakenMs: submitTimeMs,
        judgeStatus: judgeRes.status?.description,
        stderr: judgeRes.stderr, stdout
      });

      if (!correct) {
        // Wrong answer — feedback only
        socket.emit('evaluation-result', { ok: true, correct: false, details, attempt: attemptNum });
        io.to(roomId).emit('score-update', { user: socket.id, message: '❌ Wrong Answer' });

        // AI feedback
        if (userId) {
          const errorMsg = judgeRes.stderr || judgeRes.compile_output || 'Wrong output';
          const feedback = await getAIFeedback(code, question, errorMsg, attemptNum);
          socket.emit('ai-feedback', { feedback });
        }

        // Battle Royale: track attempt for scoring
        if (state.type === 'battle-royale' && state.scores?.has(socket.id)) {
          const sc = state.scores.get(socket.id);
          sc.attempts = (sc.attempts || 0) + 1;
          state.scores.set(socket.id, sc);
        }
        return;
      }

      // ===== CORRECT SUBMISSION =====
      // --- GATE 4 (re-check after async Judge0) — atomic mutex ---
      // JS is single-threaded: if another submission already set finished=true,
      // this synchronous check catches it with no race condition.
      if (state.finished) {
        socket.emit('evaluation-result', {
          ok: true, correct: true, details,
          message: 'Correct! But match was already decided.'
        });
        return;
      }

      // Immediately mark finished to prevent any simultaneous win
      state.finished = true;
      roomState.set(roomId, state);

      // Stop timer
      stopMatchTimer(roomId);

      // Broadcast match-locked to freeze ALL editors immediately
      io.to(roomId).emit('match-locked', { roomId, winnerId: socket.id });

      socket.emit('evaluation-result', { ok: true, correct: true, details, attempt: attemptNum });

      const matchDurationMs = (state.timerDuration || MATCH_TIME_LIMIT_SECONDS) * 1000;

      if (state.type === '1v1') {
        const opponentId = state.players?.find(id => id !== socket.id);
        // Phase 1: emit match-finished NOW (no DB dependency)
        emitMatchFinished1v1(roomId, socket.id, opponentId, state, submitTimeMs);
        // Phase 2: save to DB and compute ratings in background
        runPostMatchPipeline1v1(roomId, socket.id, opponentId, state, question, submitTimeMs, matchDurationMs)
          .catch(err => console.error('[Pipeline] Unhandled 1v1 error:', err.message));
      } else if (state.type === '2v2') {
        const teams = state.teams || {};
        const isRed = teams.red?.includes(socket.id);
        const teamName = isRed ? 'red' : 'blue';
        const winTeam = teams[teamName] || [];
        // Phase 1: immediate
        emitMatchFinished2v2(roomId, teamName, winTeam, state);
        // Phase 2: background
        runPostMatchPipeline2v2(roomId, teamName, state, question, submitTimeMs, matchDurationMs)
          .catch(err => console.error('[Pipeline] Unhandled 2v2 error:', err.message));
      } else if (state.type === 'battle-royale') {
        handleBattleRoyaleSolve(roomId, socket.id, state, submitTimeMs)
          .catch(err => console.error('[Pipeline] Unhandled BR error:', err.message));
      }

    } catch (err) {
      submissionLocks.delete(socket.id); // safety unlock
      console.error('submit-code error', err);
      socket.emit('evaluation-result', { ok: false, message: 'Server evaluation failed' });
    }
  });

  // Phase 1: emit match-finished IMMEDIATELY (no DB dependency)
  function emitMatchFinished1v1(roomId, winnerId, opponentId, state, submitTimeMs) {
    const winnerAttempts = state.playerAttempts?.[winnerId] || 1;
    const loserAttempts = state.playerAttempts?.[opponentId] || 0;
    const payload = {
      roomId, type: '1v1',
      winner: winnerId,            // socket ID — frontend checks vs socket.id
      winnerUserId: playerSessions.get(winnerId) || null,
      matchId: null,               // backfilled later via 'rating-update'
      draw: false,
      ratingChanges: [],           // backfilled later via 'rating-update'
      stats: {
        winner: { solveTimeMs: submitTimeMs, attempts: winnerAttempts, accuracy: 100 },
        loser: { solveTimeMs: null, attempts: loserAttempts, accuracy: 0 }
      },
      message: '✅ Correct submission! Match over.'
    };
    console.log(`[Server] emitMatchFinished1v1 → room ${roomId}, winner=${winnerId}`);
    io.to(roomId).emit('match-finished', payload);
    roomState.delete(roomId);
    roomQuestion.delete(roomId);
    return { winnerAttempts, loserAttempts };
  }

  // Phase 1: 2v2 immediate emit
  function emitMatchFinished2v2(roomId, teamName, winningTeamSockets, state) {
    const payload = {
      roomId, type: '2v2',
      winner: null, winnerTeam: teamName, winningPlayers: winningTeamSockets,
      matchId: null, draw: false, ratingChanges: [],
      message: `✅ Team ${teamName} wins!`
    };
    console.log(`[Server] emitMatchFinished2v2 → room ${roomId}, team=${teamName}`);
    io.to(roomId).emit('match-finished', payload);
    roomState.delete(roomId);
    roomQuestion.delete(roomId);
  }

  // Phase 2: background pipeline for 1v1
  async function runPostMatchPipeline1v1(roomId, winnerId, opponentId, state, question, submitTimeMs, matchDurationMs) {
    const winnerUserId = playerSessions.get(winnerId);
    const opponentUserId = playerSessions.get(opponentId);
    const winnerAttempts = state.playerAttempts?.[winnerId] || 1;
    const loserAttempts = state.playerAttempts?.[opponentId] || 0;
    let savedMatch, ratingChanges = [];
    try {
      const submissionLog = (state.submissionLog || []).map(s => ({
        player: s.userId, attempt: s.attempt, timestamp: s.timestamp,
        correct: s.correct, timeTakenMs: s.timeTakenMs,
        judgeStatus: s.judgeStatus, stderr: s.stderr, stdout: s.stdout
      }));
      savedMatch = await Match.create({
        roomId, type: '1v1',
        players: [winnerUserId, opponentUserId].filter(Boolean),
        playerSocketIds: [winnerId, opponentId],
        question: question?._id, winner: winnerUserId,
        results: [
          { player: winnerUserId, solved: true, timeTaken: submitTimeMs, attempts: winnerAttempts, score: 100, hiddenTestsPassed: true, accuracy: 100 },
          { player: opponentUserId, solved: false, timeTaken: null, attempts: loserAttempts, score: 0, hiddenTestsPassed: false, accuracy: 0 }
        ],
        submissionLog,
        analytics: { avgAttempts: (winnerAttempts + loserAttempts) / 2, fastestSolveMs: submitTimeMs, totalSubmissions: submissionLog.length, topicTags: question?.tags || [] },
        timerDurationSeconds: state.timerDuration || MATCH_TIME_LIMIT_SECONDS,
        status: 'finished', endReason: 'solved', startedAt: state.startedAt, finishedAt: new Date()
      });
      ratingChanges = await run1v1Pipeline({
        matchId: savedMatch._id, winnerUserId, loserUserId: opponentUserId, isDraw: false,
        winnerSolveMs: submitTimeMs, winnerAttempts, loserAttempts, matchDurationMs, question
      });
      console.log('[Pipeline 1v1] Done, ratingChanges:', ratingChanges);
    } catch (err) {
      console.error('[Pipeline 1v1] Error (UI already updated):', err.message);
    }
    // Push enriched data to both players (they may still be on analysis screen)
    io.to(roomId).emit('rating-update', { matchId: savedMatch?._id?.toString() || null, ratingChanges });
  }

  // Phase 2: background pipeline for 2v2
  async function runPostMatchPipeline2v2(roomId, teamName, state, question, submitTimeMs, matchDurationMs) {
    const teams = state.teams || {};
    const losingTeamName = teamName === 'red' ? 'blue' : 'red';
    const winningTeam = teams[teamName] || [];
    const losingTeam = teams[losingTeamName] || [];
    const winningTeamIds = (state.teamIds || {})[teamName] || [];
    const losingTeamIds = (state.teamIds || {})[losingTeamName] || [];
    let savedMatch, ratingChanges = [];
    try {
      savedMatch = await Match.create({
        roomId, type: '2v2',
        players: [...winningTeamIds, ...losingTeamIds].filter(Boolean),
        playerSocketIds: [...winningTeam, ...losingTeam],
        question: question?._id, winnerTeam: teamName,
        results: [
          ...winningTeamIds.map(id => ({ player: id, solved: true, score: 100, accuracy: 100 })),
          ...losingTeamIds.map(id => ({ player: id, solved: false, score: 0, accuracy: 0 }))
        ],
        timerDurationSeconds: state.timerDuration || MATCH_TIME_LIMIT_SECONDS,
        status: 'finished', endReason: 'solved', startedAt: state.startedAt, finishedAt: new Date()
      });
      ratingChanges = await run2v2Pipeline({
        matchId: savedMatch._id, winningTeamIds, losingTeamIds, solveMs: submitTimeMs, matchDurationMs, question
      });
    } catch (err) {
      console.error('[Pipeline 2v2] Error (UI already updated):', err.message);
    }
    io.to(roomId).emit('rating-update', { matchId: savedMatch?._id?.toString() || null, ratingChanges });
  }

  async function handleBattleRoyaleSolve(roomId, socketId, state, submitTimeMs) {
    if (!state.scores?.has(socketId)) return;

    const score = state.scores.get(socketId);
    if (score.solved) return; // Already solved (state.finished already set by caller)

    score.solved = true;
    score.time = submitTimeMs;
    score.solvedAt = Date.now();
    state.scores.set(socketId, score);

    io.to(roomId).emit('battle-royale-solve', {
      solver: socketId,
      time: submitTimeMs
    });

    // Don't end the match immediately — all players in BR keep trying until timer expires
    // Re-open the match so others can also solve (only 1v1/2v2 end instantly on first correct)
    state.finished = false;
    roomState.set(roomId, state);
  }

  // Battle Royale round management (timer-driven via startMatchTimer)
  async function endBattleRoyaleRound(roomId, round, isTimeout = false) {
    const state = roomState.get(roomId);
    if (!state) return;

    stopMatchTimer(roomId);
    state.finished = true;
    roomState.set(roomId, state);

    const activePlayers = Array.from(state.scores.entries())
      .filter(([id]) => !state.eliminated?.includes(id))
      .sort((a, b) => {
        if (a[1].solved !== b[1].solved) return b[1].solved - a[1].solved;
        if (a[1].solved && b[1].solved) return (a[1].time || Infinity) - (b[1].time || Infinity);
        return (b[1].attempts || 0) - (a[1].attempts || 0);
      });

    const eliminateCount = Math.max(1, Math.floor(activePlayers.length * 0.3));
    const eliminated = activePlayers.slice(-eliminateCount).map(([id]) => id);
    if (!state.eliminated) state.eliminated = [];
    state.eliminated.push(...eliminated);
    state.round = (state.round || 1) + 1;

    io.to(roomId).emit('battle-royale-eliminations', {
      eliminated, round,
      remaining: activePlayers.length - eliminateCount
    });

    const remaining = activePlayers.length - eliminateCount;
    if (remaining <= 1 || round >= 3 || isTimeout) {
      await finishBattleRoyale(roomId);
    } else {
      // Next round
      const nextQuestion = await getRandomQuestion('medium');
      roomQuestion.set(roomId, nextQuestion);

      state.scores.forEach((sc, id) => {
        if (!state.eliminated.includes(id)) {
          state.scores.set(id, { solved: false, time: null, attempts: sc.attempts || 0 });
        }
      });
      state.finished = false;
      roomState.set(roomId, state);

      setTimeout(() => {
        io.to(roomId).emit('battle-royale-round-start', {
          round: state.round, question: nextQuestion,
          timerDuration: BATTLE_ROYALE_ROUND_SECONDS
        });
        startMatchTimer(roomId, BATTLE_ROYALE_ROUND_SECONDS);
      }, 5000);
    }
  }

  async function finishBattleRoyale(roomId) {
    const state = roomState.get(roomId);
    if (!state) return;

    const question = roomQuestion.get(roomId);
    const matchDurationMs = BATTLE_ROYALE_ROUND_SECONDS * 1000;

    // Build rankings
    const sortedPlayers = Array.from(state.scores.entries())
      .map(([socketId, sc]) => ({
        socketId,
        userId: state.playerIds[state.players.indexOf(socketId)],
        solved: sc.solved,
        solveTimeMs: sc.time || null,
        wrongAttempts: sc.attempts || 0,
        position: state.eliminated?.indexOf(socketId) !== -1
          ? state.eliminated.indexOf(socketId) + 1
          : (state.eliminated?.length || 0) + 1
      }))
      .sort((a, b) => {
        if (a.solved !== b.solved) return b.solved - a.solved;
        if (a.solved && b.solved) return (a.solveTimeMs || Infinity) - (b.solveTimeMs || Infinity);
        return a.position - b.position;
      })
      .map((r, idx) => ({ ...r, position: idx + 1 }));

    let ratingChanges = [];
    let savedMatch;

    try {
      savedMatch = await Match.create({
        roomId, type: 'battle-royale',
        players: state.playerIds,
        playerSocketIds: state.players,
        question: question?._id,
        winner: sortedPlayers[0]?.userId,
        winners: sortedPlayers[0]?.userId ? [sortedPlayers[0].userId] : [],
        results: sortedPlayers.map(r => ({
          player: r.userId,
          solved: r.solved,
          timeTaken: r.solveTimeMs,
          attempts: r.wrongAttempts,
          score: r.solved ? Math.max(0, 1000 - (r.solveTimeMs || 0) / 100) : 0
        })),
        analytics: {
          totalSubmissions: (state.submissionLog || []).length,
          topicTags: question?.tags || []
        },
        status: 'finished', endReason: 'solved',
        startedAt: state.startedAt, finishedAt: new Date()
      });

      ratingChanges = await runBattleRoyalePipeline({
        matchId: savedMatch._id,
        rankings: sortedPlayers,
        matchDurationMs,
        question
      });
    } catch (err) {
      console.error('[BR] Pipeline error:', err.message);
    }

    io.to(roomId).emit('battle-royale-finished', {
      winner: sortedPlayers[0]?.socketId,
      winnerUserId: sortedPlayers[0]?.userId,
      matchId: savedMatch?._id?.toString(),
      rankings: sortedPlayers.map(r => ({
        socketId: r.socketId,
        position: r.position,
        solved: r.solved,
        time: r.solveTimeMs
      })),
      ratingChanges
    });

    roomState.delete(roomId);
    roomQuestion.delete(roomId);
  }


  // Create custom room
  socket.on('create-custom-room', async ({ maxTeams, maxPlayersPerTeam, settings, userId }) => {
    try {
      const { generateUniqueRoomCode } = require('./utils/roomCodeGenerator');

      // Generate unique room code
      const roomCode = await generateUniqueRoomCode(async (code) => {
        const existing = await CustomRoom.findOne({ roomCode: code });
        return !!existing;
      });

      // Generate unique room ID
      const roomId = `custom_br_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      // Create room
      const room = new CustomRoom({
        roomId,
        roomCode,
        hostId: userId,
        hostSocketId: socket.id,
        maxTeams: maxTeams || 10,
        maxPlayersPerTeam: maxPlayersPerTeam || 10,
        settings: {
          map: settings?.map || 'default',
          region: settings?.region || 'auto',
          minPlayersToStart: settings?.minPlayersToStart || 10
        }
      });

      // Initialize teams and slots
      room.initializeTeams();

      // Assign host to Team 1, Slot 1
      const user = await User.findById(userId);
      room.assignPlayerToSlot(1, 1, userId, socket.id, user.username);

      await room.save();

      // Join socket room
      socket.join(roomId);

      console.log(`[CustomRoom] Created room ${roomCode} (${roomId}) by user ${userId}`);

      socket.emit('room-created', {
        ok: true,
        room: {
          roomId: room.roomId,
          roomCode: room.roomCode,
          hostId: room.hostId,
          maxTeams: room.maxTeams,
          maxPlayersPerTeam: room.maxPlayersPerTeam,
          roomStatus: room.roomStatus,
          totalPlayers: room.totalPlayers,
          teams: room.teams,
          settings: room.settings
        }
      });
    } catch (error) {
      console.error('[CustomRoom] Error creating room:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Join custom room
  socket.on('join-custom-room', async ({ roomCode, userId }) => {
    try {
      const room = await CustomRoom.findOne({ roomCode: roomCode.toUpperCase() });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      if (room.roomStatus !== 'waiting') {
        return socket.emit('room-error', { error: 'Room has already started or ended' });
      }

      if (room.isFull()) {
        return socket.emit('room-error', { error: 'Room is full' });
      }

      // Check if room has expired
      if (new Date() > room.expiresAt) {
        room.roomStatus = 'ended';
        await room.save();
        return socket.emit('room-error', { error: 'Room has expired' });
      }

      // Find first available slot
      const availableSlot = room.findAvailableSlot();
      if (!availableSlot) {
        return socket.emit('room-error', { error: 'No available slots' });
      }

      // Assign player to slot
      const user = await User.findById(userId);
      room.assignPlayerToSlot(availableSlot.teamNumber, availableSlot.slotNumber, userId, socket.id, user.username);
      await room.save();

      // Join socket room
      socket.join(room.roomId);

      console.log(`[CustomRoom] User ${userId} joined room ${roomCode} at Team ${availableSlot.teamNumber}, Slot ${availableSlot.slotNumber}`);

      // Notify player
      socket.emit('room-joined', {
        ok: true,
        room: {
          roomId: room.roomId,
          roomCode: room.roomCode,
          hostId: room.hostId,
          maxTeams: room.maxTeams,
          maxPlayersPerTeam: room.maxPlayersPerTeam,
          roomStatus: room.roomStatus,
          totalPlayers: room.totalPlayers,
          teams: room.teams,
          settings: room.settings
        },
        mySlot: availableSlot
      });

      // Broadcast to all players in room
      io.to(room.roomId).emit('player-joined', {
        playerId: userId,
        username: user.username,
        teamNumber: availableSlot.teamNumber,
        slotNumber: availableSlot.slotNumber,
        totalPlayers: room.totalPlayers
      });

      // Send updated room state
      io.to(room.roomId).emit('room-state-update', {
        teams: room.teams,
        totalPlayers: room.totalPlayers
      });
    } catch (error) {
      console.error('[CustomRoom] Error joining room:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Leave custom room
  socket.on('leave-custom-room', async ({ roomId, userId }) => {
    try {
      const room = await CustomRoom.findOne({ roomId });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      const removed = room.removePlayer(userId);

      if (!removed) {
        return socket.emit('room-error', { error: 'Player not in room' });
      }

      // Check if player was host
      const wasHost = room.hostId.toString() === userId.toString();

      // If host left and there are other players, transfer host
      if (wasHost && room.totalPlayers > 0) {
        // Find first player in Team 1
        for (const team of room.teams) {
          for (const slot of team.slots) {
            if (slot.playerId) {
              room.hostId = slot.playerId;
              room.hostSocketId = slot.socketId;
              console.log(`[CustomRoom] Host transferred to ${slot.playerId}`);

              // Notify new host
              io.to(slot.socketId).emit('host-changed', {
                newHostId: slot.playerId,
                message: 'You are now the host'
              });

              break;
            }
          }
          if (room.hostId.toString() !== userId.toString()) break;
        }
      }

      await room.save();

      // Leave socket room
      socket.leave(roomId);

      console.log(`[CustomRoom] User ${userId} left room ${room.roomCode}`);

      // Notify player
      socket.emit('room-left', { ok: true });

      // Broadcast to remaining players
      io.to(roomId).emit('player-left', {
        playerId: userId,
        teamNumber: removed.teamNumber,
        slotNumber: removed.slotNumber,
        totalPlayers: room.totalPlayers
      });

      // Send updated room state
      io.to(roomId).emit('room-state-update', {
        teams: room.teams,
        totalPlayers: room.totalPlayers,
        hostId: room.hostId
      });

      // Delete room if empty
      if (room.totalPlayers === 0) {
        await CustomRoom.deleteOne({ roomId });
        console.log(`[CustomRoom] Deleted empty room ${room.roomCode}`);
      }
    } catch (error) {
      console.error('[CustomRoom] Error leaving room:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Switch team slot
  socket.on('switch-team-slot', async ({ roomId, userId, targetTeamNumber, targetSlotNumber }) => {
    try {
      const room = await CustomRoom.findOne({ roomId });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      if (room.roomStatus !== 'waiting') {
        return socket.emit('room-error', { error: 'Cannot switch slots after match has started' });
      }

      // Find target team and slot
      const targetTeam = room.teams.find(t => t.teamNumber === targetTeamNumber);
      if (!targetTeam) {
        return socket.emit('room-error', { error: 'Invalid team number' });
      }

      const targetSlot = targetTeam.slots.find(s => s.slotNumber === targetSlotNumber);
      if (!targetSlot) {
        return socket.emit('room-error', { error: 'Invalid slot number' });
      }

      if (targetSlot.playerId || targetSlot.isLocked) {
        return socket.emit('room-error', { error: 'Slot is occupied or locked' });
      }

      // Remove player from current slot
      const currentSlot = room.removePlayer(userId);
      if (!currentSlot) {
        return socket.emit('room-error', { error: 'Player not in room' });
      }

      // Assign to new slot
      const user = await User.findById(userId);
      const assigned = room.assignPlayerToSlot(targetTeamNumber, targetSlotNumber, userId, socket.id, user.username);

      if (!assigned) {
        // Rollback - reassign to original slot
        room.assignPlayerToSlot(currentSlot.teamNumber, currentSlot.slotNumber, userId, socket.id, user.username);
        return socket.emit('room-error', { error: 'Failed to switch slot' });
      }

      await room.save();

      console.log(`[CustomRoom] User ${userId} moved from Team ${currentSlot.teamNumber} Slot ${currentSlot.slotNumber} to Team ${targetTeamNumber} Slot ${targetSlotNumber}`);

      // Broadcast to all players
      io.to(roomId).emit('player-moved', {
        playerId: userId,
        username: user.username,
        fromTeam: currentSlot.teamNumber,
        fromSlot: currentSlot.slotNumber,
        toTeam: targetTeamNumber,
        toSlot: targetSlotNumber
      });

      // Send updated room state
      io.to(roomId).emit('room-state-update', {
        teams: room.teams,
        totalPlayers: room.totalPlayers
      });
    } catch (error) {
      console.error('[CustomRoom] Error switching slot:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Start custom match
  socket.on('start-custom-match', async ({ roomId, userId }) => {
    try {
      const room = await CustomRoom.findOne({ roomId });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      if (room.hostId.toString() !== userId.toString()) {
        return socket.emit('room-error', { error: 'Only host can start the match' });
      }

      if (room.roomStatus !== 'waiting') {
        return socket.emit('room-error', { error: 'Room has already started or ended' });
      }

      // No minimum player requirement - host can start with any number of players
      room.roomStatus = 'started';
      room.startedAt = new Date();
      await room.save();

      console.log(`[CustomRoom] Room ${room.roomCode} started by host ${userId}`);

      // Get question for battle royale
      const question = await getRandomQuestion();
      roomQuestion.set(roomId, question);

      // Initialize battle royale state
      const playerList = [];
      for (const team of room.teams) {
        for (const slot of team.slots) {
          if (slot.playerId) {
            playerList.push({
              id: slot.playerId.toString(),
              socketId: slot.socketId,
              username: slot.username,
              team: team.teamNumber
            });
          }
        }
      }

      roomState.set(roomId, {
        type: 'battle-royale',
        players: playerList.map(p => p.socketId),
        playerIds: playerList.map(p => p.id),
        scores: new Map(playerList.map(p => [p.socketId, { attempts: 0, solved: false, solvedAt: null }])),
        finished: false,
        startedAt: new Date()
      });

      // Broadcast match start
      io.to(roomId).emit('match-starting', {
        roomId,
        question,
        players: playerList,
        message: 'Match is starting!'
      });

      // Navigate all players to battle royale page
      setTimeout(() => {
        io.to(roomId).emit('navigate-to-match', {
          destination: `/battle-royale/${roomId}`
        });
      }, 3000);
    } catch (error) {
      console.error('[CustomRoom] Error starting match:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Join as administrator
  socket.on('join-as-admin', async ({ roomId, userId }) => {
    try {
      const room = await CustomRoom.findOne({ roomId });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      if (room.roomStatus !== 'waiting') {
        return socket.emit('room-error', { error: 'Cannot join as admin after match started' });
      }

      // Find available admin slot
      const availableSlot = room.findAvailableAdminSlot();
      if (!availableSlot) {
        return socket.emit('room-error', { error: 'All administrator slots are full' });
      }

      // Get user info
      const user = await User.findById(userId);
      if (!user) {
        return socket.emit('room-error', { error: 'User not found' });
      }

      // Assign to admin slot
      const success = room.assignAdministrator(availableSlot, userId, socket.id, user.username);
      if (!success) {
        return socket.emit('room-error', { error: 'Failed to assign administrator slot' });
      }

      await room.save();

      // Join socket room
      socket.join(roomId);

      console.log(`[CustomRoom] User ${user.username} joined as admin in room ${room.roomCode}`);

      // Broadcast updated room state
      io.to(roomId).emit('room-state-update', {
        roomId: room.roomId,
        roomCode: room.roomCode,
        teams: room.teams,
        administrators: room.administrators,
        totalPlayers: room.totalPlayers,
        hostId: room.hostId,
        roomStatus: room.roomStatus,
        settings: room.settings
      });

      socket.emit('admin-joined', {
        ok: true,
        slotNumber: availableSlot,
        message: 'Joined as administrator'
      });
    } catch (error) {
      console.error('[CustomRoom] Error joining as admin:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Update room settings (host only)
  socket.on('update-room-settings', async ({ roomId, userId, settings }) => {
    try {
      const room = await CustomRoom.findOne({ roomId });

      if (!room) {
        return socket.emit('room-error', { error: 'Room not found' });
      }

      if (room.hostId.toString() !== userId.toString()) {
        return socket.emit('room-error', { error: 'Only host can update settings' });
      }

      if (room.roomStatus !== 'waiting') {
        return socket.emit('room-error', { error: 'Cannot update settings after match started' });
      }

      // Update settings
      if (settings.difficulty && ['easy', 'medium', 'hard'].includes(settings.difficulty)) {
        room.settings.difficulty = settings.difficulty;
      }

      await room.save();

      console.log(`[CustomRoom] Room ${room.roomCode} settings updated:`, settings);

      // Broadcast updated room state
      io.to(roomId).emit('room-state-update', {
        roomId: room.roomId,
        roomCode: room.roomCode,
        teams: room.teams,
        administrators: room.administrators,
        totalPlayers: room.totalPlayers,
        hostId: room.hostId,
        roomStatus: room.roomStatus,
        settings: room.settings
      });

      socket.emit('settings-updated', {
        ok: true,
        settings: room.settings,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('[CustomRoom] Error updating settings:', error);
      socket.emit('room-error', { error: error.message });
    }
  });

  // Disconnect cleanup
  socket.on('disconnect', async () => {
    queue1v1 = queue1v1.filter(s => s.id !== socket.id);
    queue2v2 = queue2v2.filter(s => s.id !== socket.id);
    queueBattleRoyale = queueBattleRoyale.filter(s => s.id !== socket.id);

    const userId = playerSessions.get(socket.id);
    playerSessions.delete(socket.id);

    // Handle disconnections in active rooms
    for (const [roomId, state] of roomState.entries()) {
      if (state.players && state.players.includes(socket.id) && !state.finished) {
        const remainingPlayers = state.players.filter(id => id !== socket.id);

        if (state.type === 'battle-royale') {
          // Eliminate disconnected player
          if (!state.eliminated.includes(socket.id)) {
            state.eliminated.push(socket.id);
          }
          io.to(roomId).emit('player-disconnected', { socketId: socket.id });
        } else if (state.type === '1v1' && remainingPlayers.length === 1) {
          // 1v1: Remaining player wins
          const winnerId = remainingPlayers[0];
          const winnerUserId = state.playerIds.find(id =>
            playerSessions.get(winnerId) === id ||
            state.players.indexOf(winnerId) === state.playerIds.indexOf(id)
          ) || playerSessions.get(winnerId);

          state.finished = true;
          state.winner = winnerId;
          roomState.set(roomId, state);

          // Update winner stats
          if (winnerUserId) {
            try {
              const winner = await User.findById(winnerUserId);
              if (winner) {
                winner.wins += 1;
                winner.matches += 1;
                winner.xp += calculateXP('win', 'easy', '1v1');
                winner.coins += calculateCoins('win', 'easy', '1v1');
                await winner.save();
              }
            } catch (err) {
              console.error('Error updating winner stats:', err);
            }
          }

          // Notify remaining player (send directly to winner)
          io.to(winnerId).emit('match-finished', {
            roomId,
            winner: 'you', // Special value to indicate the receiving player won
            winnerUserId,
            message: 'Opponent disconnected. You win!',
            reason: 'opponent-disconnected'
          });

          io.to(winnerId).emit('receive-message', {
            user: 'System',
            message: 'Opponent disconnected. You won the match! 🎉',
            type: 'system'
          });
        } else if (state.type === '2v2') {
          // 2v2: Handle team disconnection
          const disconnectedTeam = state.teams.red.includes(socket.id) ? 'red' : 'blue';
          const winningTeam = disconnectedTeam === 'red' ? 'blue' : 'red';

          state.finished = true;
          state.winnerTeam = winningTeam;
          roomState.set(roomId, state);

          // Notify remaining players
          io.to(roomId).emit('match-finished', {
            roomId,
            winnerTeam: winningTeam,
            message: `Opposing team disconnected. Team ${winningTeam} wins!`,
            reason: 'opponent-disconnected'
          });

          io.to(roomId).emit('receive-message', {
            user: 'System',
            message: `Opposing team disconnected. Team ${winningTeam} wins! 🎉`,
            type: 'system'
          });
        } else {
          io.to(roomId).emit('player-disconnected', { socketId: socket.id });
        }
      }
    }

    console.log(`❌ Disconnected: ${socket.id}`);
  });
});

// Start server (only if not in Vercel serverless environment)
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 CodeQuest Server running at http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export app for Vercel serverless functions
module.exports = app;
