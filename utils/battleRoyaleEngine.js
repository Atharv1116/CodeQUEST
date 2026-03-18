/**
 * Battle Royale Engine — Team-based multi-round elimination
 *
 * All BR game logic lives here. server.js calls into this module
 * for match init, submissions, round transitions, and cleanup.
 *
 * In-memory state is stored in `brStates` Map keyed by roomId.
 */

const BattleRoyaleMatch = require('../models/BattleRoyaleMatch');
const Question = require('../models/Question');
const User = require('../models/User');
const { calculateBattleRoyaleElo } = require('./elo');
const { calculateXP, calculateCoins, checkBadges } = require('./gamification');
const Badge = require('../models/Badge');

// ── In-memory state ─────────────────────────────────────────────
const brStates = new Map(); // roomId → BRState
let _io = null; // Socket.IO server instance
let _onQuestionChange = null; // callback(roomId, question) when question changes

/**
 * Must be called once at server startup with the Socket.IO server.
 * @param {object} io - Socket.IO server instance
 * @param {object} opts - Optional callbacks
 * @param {function} opts.onQuestionChange - Called with (roomId, question) when question changes
 */
function init(io, opts = {}) {
  _io = io;
  _onQuestionChange = opts.onQuestionChange || null;
}

// ── Helpers ─────────────────────────────────────────────────────

async function getRandomQuestion(difficulty = 'easy') {
  try {
    const q = await Question.aggregate([
      { $match: { difficulty } },
      { $sample: { size: 1 } }
    ]);
    if (q && q.length > 0) return q[0];

    // Fallback: any question
    const any = await Question.aggregate([{ $sample: { size: 1 } }]);
    if (any && any.length > 0) return any[0];

    return {
      title: 'Default Problem',
      description: 'Write a program that reads a number N and prints it back.',
      sampleInput: '42',
      sampleOutput: '42',
      difficulty,
      _id: null
    };
  } catch (err) {
    console.error('[BREngine] Error loading question:', err.message);
    return {
      title: 'Default Problem',
      description: 'Write a program that reads a number N and prints it back.',
      sampleInput: '42',
      sampleOutput: '42',
      difficulty,
      _id: null
    };
  }
}

function difficultyForRound(round, baseDifficulty) {
  // Escalate difficulty each round
  const levels = ['easy', 'medium', 'hard'];
  const baseIdx = levels.indexOf(baseDifficulty || 'easy');
  const idx = Math.min(levels.length - 1, baseIdx + (round - 1));
  return levels[idx];
}

function buildEliminationSchedule(teamCount) {
  // For 10 teams: R1→6, R2→3, R3→1
  // For fewer teams, scale proportionally
  if (teamCount <= 1) return [{ round: 1, advanceCount: 1 }];
  if (teamCount <= 3) return [{ round: 1, advanceCount: 1 }];

  const schedule = [];
  let remaining = teamCount;
  let round = 1;

  while (remaining > 1) {
    // Keep ~60% each round, minimum 1
    let advance = Math.max(1, Math.ceil(remaining * 0.6));
    if (advance >= remaining) advance = remaining - 1;
    // Final round: only 1 team wins
    if (advance <= 1 || round >= 3) {
      schedule.push({ round, advanceCount: 1 });
      break;
    }
    schedule.push({ round, advanceCount: advance });
    remaining = advance;
    round++;
  }

  return schedule;
}

// ── Core Functions ──────────────────────────────────────────────

const BR_ROUND_DURATION_SECONDS = 300; // 5 minutes per round
const BR_INTERMISSION_SECONDS = 10;    // 10 seconds between rounds

/**
 * Initialize a team-based Battle Royale match.
 * Called when host clicks "Start Match" in custom room lobby.
 */
async function initBattleRoyale(roomId, customRoom) {
  if (!_io) throw new Error('BREngine not initialized — call init(io) first');
  if (brStates.has(roomId)) {
    console.warn(`[BREngine] State already exists for ${roomId}, overwriting`);
  }

  // Extract teams with at least 1 player
  const teams = [];
  for (const team of customRoom.teams) {
    if (team.teamNumber === 99) continue; // Exclude Admin Spectator team
    
    const players = team.slots
      .filter(s => s.playerId)
      .map(s => ({
        userId: s.playerId.toString(),
        username: s.username,
        socketId: s.socketId
      }));
    if (players.length > 0) {
      teams.push({
        teamNumber: team.teamNumber,
        players,
        status: 'active',
        eliminatedInRound: null
      });
    }
  }

  if (teams.length < 2) {
    throw new Error('Need at least 2 teams with players to start');
  }

  const baseDifficulty = customRoom.settings?.difficulty || 'easy';
  const roundDifficulty = difficultyForRound(1, baseDifficulty);
  const question = await getRandomQuestion(roundDifficulty);
  const eliminationSchedule = buildEliminationSchedule(teams.length);
  const totalRounds = eliminationSchedule.length;

  // Build in-memory state
  const state = {
    roomId,
    customRoomId: customRoom.roomId,
    teams,
    currentRound: 1,
    totalRounds,
    baseDifficulty,
    eliminationSchedule,
    status: 'active', // 'active' | 'between-rounds' | 'finished'

    // Current round data
    roundQuestion: question,
    roundStartedAt: Date.now(),
    roundDurationSeconds: BR_ROUND_DURATION_SECONDS,
    roundTimerEndAt: Date.now() + BR_ROUND_DURATION_SECONDS * 1000,
    roundTimerInterval: null,

    // Per-round submission tracking: Map<visitorUserId, { correct, submissionTimeMs, attempt }>
    roundSubmissions: new Map(),
    // Track attempts per player this round
    roundAttempts: new Map(),

    // Persisted document ID
    matchDocId: null,

    startedAt: Date.now()
  };

  // Create DB document
  try {
    const doc = await BattleRoyaleMatch.create({
      roomId,
      customRoomId: customRoom.roomId,
      teams: teams.map(t => ({
        teamNumber: t.teamNumber,
        players: t.players.map(p => ({
          userId: p.userId,
          username: p.username,
          socketId: p.socketId
        })),
        status: 'active'
      })),
      eliminationSchedule,
      currentRound: 1,
      totalRounds,
      status: 'active',
      startedAt: new Date()
    });
    state.matchDocId = doc._id;
  } catch (err) {
    console.error('[BREngine] Error creating match doc:', err.message);
  }

  brStates.set(roomId, state);

  // Build player list for easier lookups
  const allPlayers = [];
  for (const team of teams) {
    for (const p of team.players) {
      allPlayers.push({ ...p, teamNumber: team.teamNumber });
    }
  }

  // Broadcast match start to all players
  const leaderboard = computeTeamLeaderboard(state);

  _io.to(roomId).emit('br-match-started', {
    roomId,
    teams: teams.map(t => ({
      teamNumber: t.teamNumber,
      players: t.players.map(p => ({ userId: p.userId, username: p.username })),
      status: t.status
    })),
    question: sanitizeQuestion(question),
    round: 1,
    totalRounds,
    timerDuration: BR_ROUND_DURATION_SECONDS,
    leaderboard,
    eliminationSchedule
  });

  // Notify server.js about the question for submit-code handler
  if (_onQuestionChange) _onQuestionChange(roomId, question);

  // Start timer
  startRoundTimer(roomId);

  console.log(`[BREngine] Match initialized: ${roomId}, ${teams.length} teams, ${allPlayers.length} players`);
  return state;
}

/**
 * Handle a player submission during a BR round.
 * Returns { updated: bool, leaderboard } or null if ignored.
 */
function handleBRSubmission(roomId, socketId, userId, correct, submitTimeMs) {
  const state = brStates.get(roomId);
  if (!state || state.status !== 'active') return null;

  // Find player's team
  let playerTeam = null;
  for (const team of state.teams) {
    if (team.status !== 'active') continue;
    const player = team.players.find(p => p.socketId === socketId || p.userId === userId);
    if (player) {
      playerTeam = team;
      break;
    }
  }
  if (!playerTeam) return null;

  // Track attempt count
  const attemptKey = userId || socketId;
  const currentAttempts = (state.roundAttempts.get(attemptKey) || 0) + 1;
  state.roundAttempts.set(attemptKey, currentAttempts);

  if (!correct) {
    // Wrong submission — just track attempt, no leaderboard change
    return { updated: false, leaderboard: null };
  }

  // ── Correct submission ──
  // Check if this player already solved this round (dedup)
  if (state.roundSubmissions.has(attemptKey)) {
    console.log(`[BREngine] Duplicate correct from ${attemptKey} — ignoring`);
    return { updated: false, leaderboard: null, duplicate: true };
  }

  // Record first correct submission
  state.roundSubmissions.set(attemptKey, {
    userId,
    teamNumber: playerTeam.teamNumber,
    submissionTimeMs: submitTimeMs,
    attempt: currentAttempts,
    timestamp: Date.now()
  });

  // Recompute leaderboard
  const leaderboard = computeTeamLeaderboard(state);

  // Broadcast live leaderboard update
  _io.to(roomId).emit('br-leaderboard-update', {
    roomId,
    leaderboard,
    round: state.currentRound,
    solver: {
      userId,
      teamNumber: playerTeam.teamNumber,
      submissionTimeMs: submitTimeMs
    }
  });

  console.log(`[BREngine] Correct submission: user=${userId}, team=${playerTeam.teamNumber}, time=${submitTimeMs}ms`);

  // Check for early round termination (all active players have solved)
  const activePlayersCount = state.teams
    .filter(t => t.status === 'active')
    .reduce((acc, t) => acc + t.players.length, 0);

  if (state.roundSubmissions.size >= activePlayersCount) {
    console.log(`[BREngine] All ${activePlayersCount} active players have solved. Terminating round ${state.currentRound} ahead of timer.`);
    
    // Clear the existing timer so we don't trigger endBRRound twice
    const timerId = roundTimers.get(roomId);
    if (timerId) {
      clearInterval(timerId);
      roundTimers.delete(roomId);
    }
    
    // Execute round end immediately
    endBRRound(roomId);
  }

  return { updated: true, leaderboard };
}

/**
 * Compute team leaderboard for current round.
 * Returns sorted array: [{ teamNumber, solvesCount, totalTimeMs, rank, players }]
 */
function computeTeamLeaderboard(state) {
  const activeTeams = state.teams.filter(t => t.status === 'active');
  const teamScores = activeTeams.map(team => {
    const teamSubmissions = [];
    for (const [, sub] of state.roundSubmissions) {
      if (sub.teamNumber === team.teamNumber) {
        teamSubmissions.push(sub);
      }
    }

    const solvesCount = teamSubmissions.length;
    const totalTimeMs = teamSubmissions.reduce((sum, s) => sum + s.submissionTimeMs, 0);
    const totalPlayers = team.players.length;

    return {
      teamNumber: team.teamNumber,
      solvesCount,
      totalPlayers,
      totalTimeMs,
      rank: 0, // computed after sort
      playerSolves: teamSubmissions.map(s => ({
        userId: s.userId,
        submissionTimeMs: s.submissionTimeMs
      }))
    };
  });

  // Sort: primary = more solves first, secondary = less total time first
  teamScores.sort((a, b) => {
    if (b.solvesCount !== a.solvesCount) return b.solvesCount - a.solvesCount;
    return a.totalTimeMs - b.totalTimeMs;
  });

  // Assign ranks
  teamScores.forEach((t, idx) => { t.rank = idx + 1; });

  // Include eliminated teams at the bottom
  const eliminatedTeams = state.teams
    .filter(t => t.status === 'eliminated')
    .map(t => ({
      teamNumber: t.teamNumber,
      solvesCount: 0,
      totalPlayers: t.players.length,
      totalTimeMs: 0,
      rank: teamScores.length + 1,
      eliminated: true,
      eliminatedInRound: t.eliminatedInRound,
      playerSolves: []
    }));

  return [...teamScores, ...eliminatedTeams];
}

/**
 * End the current round. Called by timer expiry.
 */
async function endBRRound(roomId) {
  const state = brStates.get(roomId);
  if (!state || state.status === 'finished') return;

  stopRoundTimer(roomId);
  state.status = 'between-rounds';

  const round = state.currentRound;
  const leaderboard = computeTeamLeaderboard(state);
  const activeTeams = leaderboard.filter(t => !t.eliminated);

  // Determine how many advance this round
  const scheduleEntry = state.eliminationSchedule.find(s => s.round === round);
  const advanceCount = scheduleEntry ? scheduleEntry.advanceCount : 1;

  // Teams that advance vs eliminated
  const advancingTeams = activeTeams.slice(0, advanceCount);
  const eliminatedTeams = activeTeams.slice(advanceCount);

  // Mark eliminated teams in state
  for (const elim of eliminatedTeams) {
    const team = state.teams.find(t => t.teamNumber === elim.teamNumber);
    if (team) {
      team.status = 'eliminated';
      team.eliminatedInRound = round;
    }
  }

  // Build round results for DB
  const roundData = {
    roundNumber: round,
    questionId: state.roundQuestion?._id || null,
    difficulty: difficultyForRound(round, state.baseDifficulty),
    startedAt: new Date(state.roundStartedAt),
    endedAt: new Date(),
    durationSeconds: state.roundDurationSeconds,
    submissions: Array.from(state.roundSubmissions.values()).map(s => ({
      userId: s.userId,
      teamNumber: s.teamNumber,
      correct: true,
      submissionTimeMs: s.submissionTimeMs,
      attempt: s.attempt,
      timestamp: new Date(s.timestamp)
    })),
    teamScores: leaderboard.filter(t => !t.eliminated || t.eliminatedInRound === round).map(t => ({
      teamNumber: t.teamNumber,
      solvesCount: t.solvesCount,
      totalTimeMs: t.totalTimeMs,
      rank: t.rank,
      advanced: advancingTeams.some(a => a.teamNumber === t.teamNumber)
    }))
  };

  // Persist round to DB
  try {
    await BattleRoyaleMatch.findByIdAndUpdate(state.matchDocId, {
      $push: { rounds: roundData },
      $set: {
        currentRound: round,
        status: 'between-rounds',
        teams: state.teams.map(t => ({
          teamNumber: t.teamNumber,
          players: t.players.map(p => ({
            userId: p.userId,
            username: p.username,
            socketId: p.socketId
          })),
          status: t.status,
          eliminatedInRound: t.eliminatedInRound
        }))
      }
    });
  } catch (err) {
    console.error('[BREngine] Error persisting round:', err.message);
  }

  // Broadcast round results
  _io.to(roomId).emit('br-round-ended', {
    roomId,
    round,
    leaderboard,
    advanced: advancingTeams.map(t => ({
      teamNumber: t.teamNumber,
      solvesCount: t.solvesCount,
      totalTimeMs: t.totalTimeMs,
      rank: t.rank
    })),
    eliminated: eliminatedTeams.map(t => ({
      teamNumber: t.teamNumber,
      solvesCount: t.solvesCount,
      totalTimeMs: t.totalTimeMs,
      rank: t.rank
    })),
    isFinalRound: advancingTeams.length <= 1 || round >= state.totalRounds
  });

  console.log(`[BREngine] Round ${round} ended: ${advancingTeams.length} advance, ${eliminatedTeams.length} eliminated`);

  // Check if match is over
  if (advancingTeams.length <= 1 || round >= state.totalRounds) {
    // Wait briefly before showing final results
    setTimeout(() => finishBattleRoyale(roomId), 5000);
  } else {
    // Wait for intermission, then start next round
    console.log(`[BREngine] Intermission — next round in ${BR_INTERMISSION_SECONDS}s`);
    setTimeout(() => startNextBRRound(roomId), BR_INTERMISSION_SECONDS * 1000);
  }
}

/**
 * Start the next round after intermission.
 */
async function startNextBRRound(roomId) {
  const state = brStates.get(roomId);
  if (!state || state.status === 'finished') return;

  state.currentRound += 1;
  const round = state.currentRound;
  const difficulty = difficultyForRound(round, state.baseDifficulty);

  // Get new question
  const question = await getRandomQuestion(difficulty);
  state.roundQuestion = question;

  // Notify server.js about the new question for submit-code handler
  if (_onQuestionChange) _onQuestionChange(roomId, question);

  // Reset per-round tracking
  state.roundSubmissions = new Map();
  state.roundAttempts = new Map();
  state.roundStartedAt = Date.now();
  state.roundTimerEndAt = Date.now() + BR_ROUND_DURATION_SECONDS * 1000;
  state.status = 'active';

  const leaderboard = computeTeamLeaderboard(state);

  // Broadcast new round
  _io.to(roomId).emit('br-round-started', {
    roomId,
    round,
    totalRounds: state.totalRounds,
    question: sanitizeQuestion(question),
    timerDuration: BR_ROUND_DURATION_SECONDS,
    leaderboard,
    activeTeams: state.teams.filter(t => t.status === 'active').map(t => t.teamNumber)
  });

  // Start timer
  startRoundTimer(roomId);

  console.log(`[BREngine] Round ${round} started (difficulty: ${difficulty})`);
}

/**
 * Finish the Battle Royale: compute final rankings, update DB, broadcast results.
 */
async function finishBattleRoyale(roomId) {
  const state = brStates.get(roomId);
  if (!state) return;

  stopRoundTimer(roomId);
  state.status = 'finished';

  // Build final rankings based on elimination order
  // Teams eliminated last rank higher, winner ranks #1
  const finalRankings = [];

  // Active teams (winners) first
  const activeTeams = state.teams.filter(t => t.status === 'active');
  activeTeams.forEach((t, idx) => {
    finalRankings.push({
      teamNumber: t.teamNumber,
      rank: idx + 1,
      totalSolves: 0, // computed below
      totalTimeMs: 0,
      roundsSurvived: state.currentRound
    });
  });

  // Eliminated teams sorted by elimination round (later = higher rank)
  const eliminatedTeams = state.teams
    .filter(t => t.status === 'eliminated')
    .sort((a, b) => (b.eliminatedInRound || 0) - (a.eliminatedInRound || 0));

  eliminatedTeams.forEach((t, idx) => {
    finalRankings.push({
      teamNumber: t.teamNumber,
      rank: activeTeams.length + idx + 1,
      totalSolves: 0,
      totalTimeMs: 0,
      roundsSurvived: t.eliminatedInRound || 0
    });
  });

  const winnerTeam = finalRankings.length > 0 ? finalRankings[0].teamNumber : null;

  // Persist final state
  try {
    await BattleRoyaleMatch.findByIdAndUpdate(state.matchDocId, {
      status: 'finished',
      winnerTeam,
      finalRankings,
      finishedAt: new Date(),
      currentRound: state.currentRound
    });
  } catch (err) {
    console.error('[BREngine] Error persisting final state:', err.message);
  }

  // Run rating pipeline for all players
  let ratingChanges = [];
  try {
    ratingChanges = await runBRRatingPipeline(state, finalRankings);
  } catch (err) {
    console.error('[BREngine] Rating pipeline error:', err.message);
  }

  // Include team player info in final rankings for display
  const enrichedRankings = finalRankings.map(r => {
    const team = state.teams.find(t => t.teamNumber === r.teamNumber);
    return {
      ...r,
      players: team ? team.players.map(p => ({ userId: p.userId, username: p.username })) : [],
      status: team ? team.status : 'eliminated'
    };
  });

  // Broadcast final results
  _io.to(roomId).emit('br-match-finished', {
    roomId,
    winnerTeam,
    finalRankings: enrichedRankings,
    ratingChanges,
    matchId: state.matchDocId?.toString()
  });

  console.log(`[BREngine] Match finished: ${roomId}, winner team=${winnerTeam}`);

  // Cleanup after a delay (allow clients to consume the event)
  setTimeout(() => {
    brStates.delete(roomId);
  }, 60000);
}

/**
 * Run ELO + XP/coins pipeline for all BR players.
 */
async function runBRRatingPipeline(state, finalRankings) {
  const allPlayerIds = [];
  const playerTeamMap = {}; // userId -> teamNumber

  for (const team of state.teams) {
    for (const p of team.players) {
      if (p.userId) {
        allPlayerIds.push(p.userId);
        playerTeamMap[p.userId] = team.teamNumber;
      }
    }
  }

  const users = await User.find({ _id: { $in: allPlayerIds } });
  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));

  const avgRating = users.reduce((sum, u) => sum + u.rating, 0) / Math.max(1, users.length);
  const totalPlayers = allPlayerIds.length;
  const ratingChanges = [];
  const now = new Date();

  for (const ranking of finalRankings) {
    const team = state.teams.find(t => t.teamNumber === ranking.teamNumber);
    if (!team) continue;

    for (const player of team.players) {
      const u = userMap[player.userId];
      if (!u) continue;

      const ratingBefore = u.rating;
      const position = ranking.rank;
      const isWinner = position === 1;

      // Use existing BR elo calculator
      const { delta, newRating } = calculateBattleRoyaleElo(
        u.rating, avgRating, position, finalRankings.length,
        0, BR_ROUND_DURATION_SECONDS * 1000, 0
      );

      u.rating = newRating;
      u.matches += 1;

      if (isWinner) {
        u.wins += 1;
        u.streak += 1;
        u.longestStreak = Math.max(u.longestStreak, u.streak);
        u.lastPlayDate = now;
        u.xp += calculateXP('win', 'medium', 'battle-royale');
        u.coins += calculateCoins('win', 'medium', 'battle-royale', position);
      } else {
        u.losses += 1;
        u.streak = 0;
        u.xp += calculateXP('loss', 'medium', 'battle-royale');
        u.coins += calculateCoins('loss', 'medium', 'battle-royale', position);
      }

      if (state.matchDocId) {
        u.ratingHistory.push({
          matchId: state.matchDocId,
          delta,
          ratingAfter: newRating,
          timestamp: now
        });
      }

      await checkBadges(u, Badge);
      await u.save();

      ratingChanges.push({
        userId: player.userId,
        username: u.username,
        teamNumber: ranking.teamNumber,
        before: ratingBefore,
        after: newRating,
        delta
      });
    }
  }

  return ratingChanges;
}

// ── Timer Management ────────────────────────────────────────────

function startRoundTimer(roomId) {
  const state = brStates.get(roomId);
  if (!state) return;

  state.roundTimerEndAt = Date.now() + state.roundDurationSeconds * 1000;

  state.roundTimerInterval = setInterval(async () => {
    const s = brStates.get(roomId);
    if (!s || s.status !== 'active') {
      clearInterval(s?.roundTimerInterval);
      return;
    }

    const remaining = Math.max(0, Math.ceil((s.roundTimerEndAt - Date.now()) / 1000));
    _io.to(roomId).emit('timer-tick', { remaining, roomId });

    if (remaining <= 0) {
      clearInterval(s.roundTimerInterval);
      s.roundTimerInterval = null;
      await endBRRound(roomId);
    }
  }, 1000);
}

function stopRoundTimer(roomId) {
  const state = brStates.get(roomId);
  if (state?.roundTimerInterval) {
    clearInterval(state.roundTimerInterval);
    state.roundTimerInterval = null;
  }
}

// ── State Access ────────────────────────────────────────────────

/**
 * Get current BR state for reconnection / REST API.
 */
function getBRState(roomId) {
  const state = brStates.get(roomId);
  if (!state) return null;

  const timerRemaining = state.roundTimerEndAt
    ? Math.max(0, Math.ceil((state.roundTimerEndAt - Date.now()) / 1000))
    : 0;

  const leaderboard = computeTeamLeaderboard(state);

  return {
    roomId: state.roomId,
    status: state.status,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    timerRemaining,
    timerDuration: state.roundDurationSeconds,
    question: sanitizeQuestion(state.roundQuestion),
    teams: state.teams.map(t => ({
      teamNumber: t.teamNumber,
      players: t.players.map(p => ({ userId: p.userId, username: p.username })),
      status: t.status,
      eliminatedInRound: t.eliminatedInRound
    })),
    leaderboard,
    eliminationSchedule: state.eliminationSchedule
  };
}

/**
 * Check if a room is running a BR match.
 */
function hasBRState(roomId) {
  return brStates.has(roomId);
}

/**
 * Get the BR match type identifier (used in server.js submit-code routing).
 */
function getBRMatchType() {
  return 'custom-battle-royale';
}

// ── Utilities ───────────────────────────────────────────────────

function sanitizeQuestion(q) {
  if (!q) return null;
  return {
    _id: q._id,
    title: q.title,
    description: q.description,
    inputFormat: q.inputFormat,
    outputFormat: q.outputFormat,
    sampleInput: q.sampleInput,
    sampleOutput: q.sampleOutput,
    difficulty: q.difficulty,
    tags: q.tags,
    timeLimit: q.timeLimit,
    memoryLimit: q.memoryLimit,
    points: q.points,
    // Explicitly exclude: solution, testCases (hidden)
  };
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  init,
  initBattleRoyale,
  handleBRSubmission,
  computeTeamLeaderboard,
  endBRRound,
  startNextBRRound,
  finishBattleRoyale,
  getBRState,
  hasBRState,
  getBRMatchType,
  BR_ROUND_DURATION_SECONDS,
  BR_INTERMISSION_SECONDS
};
