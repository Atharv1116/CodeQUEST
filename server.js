
// server.js - Enhanced CodeQuest Server
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// Database & Models
const connectDB = require('./config/database');
const User = require('./models/User');
const Question = require('./models/Question');
const Match = require('./models/Match');

// Utils & Services
const { submitToJudge0, LANGUAGE_IDS } = require('./config/judge0');
const { calculateElo, calculateTeamElo } = require('./utils/elo');
const { calculateXP, calculateCoins, checkBadges } = require('./utils/gamification');
const { getAIFeedback, getHint, recommendProblems } = require('./services/aiTutor');

// Routes
const { router: authRouter, authenticateToken } = require('./routes/auth');
const apiRouter = require('./routes/api');
const aiTutorRouter = require('./routes/aiTutor');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);
app.use('/api/ai-tutor', aiTutorRouter);

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

// Battle Royale configuration
const BATTLE_ROYALE_MIN_PLAYERS = 4;
const BATTLE_ROYALE_MAX_PLAYERS = 12;
const BATTLE_ROYALE_ROUND_TIME = 300000; // 5 minutes per round
const BATTLE_ROYALE_ELIMINATION_RATE = 0.3; // Eliminate 30% each round

// Helper: Get random question
async function getRandomQuestion(difficulty = null) {
  const query = difficulty ? { difficulty } : {};
  const q = await Question.aggregate([
    { $match: query },
    { $sample: { size: 1 } }
  ]);
  
  if (!q || q.length === 0) {
    return {
      title: 'Default Problem',
      description: 'Solve this problem',
      sampleInput: 'test',
      sampleOutput: 'test',
      difficulty: 'easy',
      _id: null
    };
  }
  return q[0];
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
        finished: false,
        startedAt: new Date()
      };
      roomState.set(roomId, state);

      // Get user IDs
      const userId1 = playerSessions.get(player1.id);
      const userId2 = playerSessions.get(player2.id);
      if (userId1) state.playerIds.push(userId1);
      if (userId2) state.playerIds.push(userId2);

      io.to(roomId).emit('match-found', {
        roomId,
        players: [player1.id, player2.id],
        type: '1v1',
        question
      });
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
          question
        });
      });
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
        totalRounds: 3
      });

      // Start round timer
      startBattleRoyaleRound(roomId, 1);
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
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);
    
    // Send question to player if they join after match-found was emitted
    const question = roomQuestion.get(roomId);
    if (question) {
      socket.emit('match-found', {
        roomId,
        question,
        type: roomState.get(roomId)?.type || '1v1'
      });
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

  // Code submission
  socket.on('submit-code', async ({ roomId, code, language_id, inputOverride }) => {
    try {
      const state = roomState.get(roomId);
      const question = roomQuestion.get(roomId);

      if (!state || !question) {
        socket.emit('evaluation-result', { ok: false, message: 'Room or question not found' });
        return;
      }
      if (state.finished) {
        socket.emit('evaluation-result', { ok: false, message: 'Match already finished' });
        return;
      }

      socket.emit('evaluation-started', { message: 'Evaluating...' });

      const judgeRes = await submitToJudge0({
        source_code: code,
        language_id,
        stdin: inputOverride !== undefined ? String(inputOverride) : (question.sampleInput || ''),
        expected_output: question.sampleOutput || ''
      });

      const stdout = (judgeRes.stdout || '').trim();
      const expected = (question.sampleOutput || '').trim();
      const correct = stdout === expected;

      const details = {
        status: judgeRes.status ? judgeRes.status.description : undefined,
        stdout,
        stderr: judgeRes.stderr,
        compile_output: judgeRes.compile_output,
        time: judgeRes.time,
        memory: judgeRes.memory,
        correct
      };

      if (correct) {
        const submitTime = Date.now() - (state.startedAt?.getTime() || Date.now());
        
        if (state.type === '1v1') {
          await handle1v1Win(roomId, socket.id, state, question, details, submitTime);
        } else if (state.type === '2v2') {
          await handle2v2Win(roomId, socket.id, state, question, details, submitTime);
        } else if (state.type === 'battle-royale') {
          await handleBattleRoyaleSolve(roomId, socket.id, state, submitTime);
        }
      } else {
        // Wrong answer - provide AI feedback
        const userId = playerSessions.get(socket.id);
        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            const errorMsg = judgeRes.stderr || judgeRes.compile_output || 'Wrong output';
            const feedback = await getAIFeedback(code, question, errorMsg, 
              state.scores?.get(socket.id)?.attempts || 0);
            
            socket.emit('ai-feedback', { feedback });
            
            // Update attempt count for battle royale
            if (state.type === 'battle-royale' && state.scores.has(socket.id)) {
              const score = state.scores.get(socket.id);
              score.attempts += 1;
              state.scores.set(socket.id, score);
            }
          }
        }
        
        socket.emit('evaluation-result', { ok: true, correct: false, details });
        io.to(roomId).emit('score-update', {
          user: socket.id,
          message: '❌ Wrong Output'
        });
      }
    } catch (err) {
      console.error('submit-code error', err);
      socket.emit('evaluation-result', { ok: false, message: 'Server evaluation failed' });
    }
  });

  async function handle1v1Win(roomId, socketId, state, question, details, submitTime) {
    const winnerId = socketId;
    const opponentId = state.players.find(id => id !== winnerId);
    const winnerUserId = playerSessions.get(winnerId);
    const opponentUserId = playerSessions.get(opponentId);

    if (!winnerUserId || !opponentUserId) {
      socket.emit('evaluation-result', { ok: true, correct: true, details });
      return;
    }

    const winner = await User.findById(winnerUserId);
    const loser = await User.findById(opponentUserId);

    const [newWinnerRating, newLoserRating] = calculateElo(winner.rating, loser.rating);

    // Update winner
    winner.rating = newWinnerRating;
    winner.wins += 1;
    winner.matches += 1;
    winner.xp += calculateXP('win', question.difficulty, '1v1');
    winner.coins += calculateCoins('win', question.difficulty, '1v1');
    winner.streak += 1;
    winner.longestStreak = Math.max(winner.longestStreak, winner.streak);
    winner.lastPlayDate = new Date();
    await checkBadges(winner, require('./models/Badge'));
    await winner.save();

    // Update loser
    loser.rating = newLoserRating;
    loser.losses += 1;
    loser.matches += 1;
    loser.xp += calculateXP('loss', question.difficulty, '1v1');
    loser.streak = 0;
    await loser.save();

    // Save match
    await Match.create({
      roomId,
      type: '1v1',
      players: [winnerUserId, opponentUserId],
      playerSocketIds: [winnerId, opponentId],
      question: question._id,
      winner: winnerUserId,
      results: [
        { player: winnerUserId, solved: true, timeTaken: submitTime, score: 100 },
        { player: opponentUserId, solved: false, timeTaken: null, score: 0 }
      ],
      status: 'finished',
      startedAt: state.startedAt,
      finishedAt: new Date()
    });

    state.finished = true;
    state.winner = winnerId;
    roomState.set(roomId, state);

    io.to(roomId).emit('match-finished', {
      roomId,
      winner: winnerId,
      winnerUserId,
      message: `✅ ${winnerId} solved it first!`
    });

    socket.emit('evaluation-result', { ok: true, correct: true, details });
    socket.to(roomId).emit('opponent-solved', { solver: socketId, details });
  }

  async function handle2v2Win(roomId, socketId, state, question, details, submitTime) {
    const teams = state.teams || {};
    const isRed = teams.red && teams.red.includes(socketId);
    const teamName = isRed ? 'red' : 'blue';
    const winningTeam = teams[teamName];
    const losingTeam = teams[teamName === 'red' ? 'blue' : 'red'];
    const winningTeamIds = state.teamIds[teamName];
    const losingTeamIds = state.teamIds[teamName === 'red' ? 'blue' : 'red'];

    state.finished = true;
    state.winnerTeam = teamName;
    roomState.set(roomId, state);

    // Get team ratings
    const winners = await User.find({ _id: { $in: winningTeamIds } });
    const losers = await User.find({ _id: { $in: losingTeamIds } });

    const winnerRatings = winners.map(u => u.rating);
    const loserRatings = losers.map(u => u.rating);

    const { team1, team2 } = calculateTeamElo(winnerRatings, loserRatings, true);

    // Update winners
    for (let i = 0; i < winners.length; i++) {
      winners[i].rating = team1[i];
      winners[i].wins += 1;
      winners[i].matches += 1;
      winners[i].xp += calculateXP('win', question.difficulty, '2v2');
      winners[i].coins += calculateCoins('win', question.difficulty, '2v2');
      winners[i].streak += 1;
      await checkBadges(winners[i], require('./models/Badge'));
      await winners[i].save();
    }

    // Update losers
    for (let i = 0; i < losers.length; i++) {
      losers[i].rating = team2[i];
      losers[i].losses += 1;
      losers[i].matches += 1;
      losers[i].xp += calculateXP('loss', question.difficulty, '2v2');
      losers[i].streak = 0;
      await losers[i].save();
    }

    // Save match
    await Match.create({
      roomId,
      type: '2v2',
      players: [...winningTeamIds, ...losingTeamIds],
      playerSocketIds: [...winningTeam, ...losingTeam],
      question: question._id,
      winnerTeam: teamName,
      results: [
        ...winningTeamIds.map(id => ({ player: id, solved: true, score: 100 })),
        ...losingTeamIds.map(id => ({ player: id, solved: false, score: 0 }))
      ],
      status: 'finished',
      startedAt: state.startedAt,
      finishedAt: new Date()
    });

    io.to(roomId).emit('match-finished', {
      roomId,
      winnerTeam: teamName,
      winningPlayers: winningTeam,
      message: `✅ Team ${teamName} wins!`
    });

    socket.emit('evaluation-result', { ok: true, correct: true, details });
  }

  async function handleBattleRoyaleSolve(roomId, socketId, state, submitTime) {
    if (!state.scores.has(socketId)) return;

    const score = state.scores.get(socketId);
    if (score.solved) return; // Already solved

    score.solved = true;
    score.time = submitTime;
    state.scores.set(socketId, score);

    // Notify others
    io.to(roomId).emit('battle-royale-solve', {
      solver: socketId,
      time: submitTime
    });

    socket.emit('evaluation-result', { ok: true, correct: true, details: { solved: true } });
  }

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
