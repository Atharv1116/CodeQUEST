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

// Fix 7: Strict difficulty progression regardless of base setting
const BR_DIFFICULTY_BY_ROUND = { 1: 'easy', 2: 'medium', 3: 'hard' };

function difficultyForRound(round, _baseDifficulty) {
  return BR_DIFFICULTY_BY_ROUND[round] || 'hard';
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

// Fix 6: Per-round durations (in seconds)
const BR_ROUND_DURATIONS = { 1: 600, 2: 1200, 3: 1800 }; // 10m, 20m, 30m
const BR_ROUND_DURATION_SECONDS = 600; // Default fallback (round 1)
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

    // Current round data — Fix 6: use per-round duration
    roundQuestion: question,
    roundStartedAt: Date.now(),
    roundDurationSeconds: BR_ROUND_DURATIONS[1] || BR_ROUND_DURATION_SECONDS,
    roundTimerEndAt: Date.now() + (BR_ROUND_DURATIONS[1] || BR_ROUND_DURATION_SECONDS) * 1000,
    roundTimerInterval: null,

    // Per-round submission tracking: Map<visitorUserId, { correct, submissionTimeMs, attempt }>
    roundSubmissions: new Map(),
    // Track attempts per player this round
    roundAttempts: new Map(),
    // Fix 11: Track ALL players who have submitted (correct or incorrect) for early termination
    roundSubmittedPlayers: new Set(),

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
    timerDuration: BR_ROUND_DURATIONS[1] || BR_ROUND_DURATION_SECONDS,
    difficulty: difficultyForRound(1),
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

  // Fix 11: Track that this player has submitted (correct or incorrect)
  if (!state.roundSubmittedPlayers) state.roundSubmittedPlayers = new Set();
  state.roundSubmittedPlayers.add(attemptKey);

  if (!correct) {
    // Wrong submission — track attempt, check early termination, no leaderboard change
    checkEarlyTermination(roomId, state);
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

  // Fix 5/8/11: Check for early round termination (all active players have submitted)
  checkEarlyTermination(roomId, state);

  return { updated: true, leaderboard };
}

const SCORING_CURVE = [
  100, 92, 85, 79, 74, 69, 65, 61, 58, 55, 
  52, 49, 46, 43, 40, 37, 35, 33, 31, 29, 
  27, 25, 23, 21, 19, 17, 16, 15, 14, 13, 
  12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 
  3, 3, 2, 2, 2, 2, 1, 1, 1, 1
];

function getDynamicPoints(rank, totalPlayers) {
  if (totalPlayers <= 1) return SCORING_CURVE[0];
  
  // Scale rank (1..totalPlayers) mapped onto (0..49) index range
  let exact = ((rank - 1) / (totalPlayers - 1)) * (SCORING_CURVE.length - 1);
  if (exact < 0) exact = 0;
  if (exact > SCORING_CURVE.length - 1) exact = SCORING_CURVE.length - 1;

  const lower = Math.floor(exact);
  const upper = Math.ceil(exact);
  const fraction = exact - lower;
  
  if (lower >= SCORING_CURVE.length - 1) return SCORING_CURVE[SCORING_CURVE.length - 1];
  
  return Math.round(SCORING_CURVE[lower] * (1 - fraction) + SCORING_CURVE[upper] * fraction);
}

/**
 * Compute team leaderboard for current round.
 * Returns sorted array with full Esports dynamic point metrics.
 */
function computeTeamLeaderboard(state) {
  const activeTeams = state.teams.filter(t => t.status === 'active');
  const N = activeTeams.reduce((acc, t) => acc + (t.players ? t.players.length : 0), 0);

  // Extract all correct submissions into a list
  const allSubmissions = [];
  for (const [, sub] of state.roundSubmissions) {
    allSubmissions.push(sub);
  }

  // Sort globally by time to deduce exact ranks
  allSubmissions.sort((a, b) => a.submissionTimeMs - b.submissionTimeMs);

  // Extract global rank honoring ties (competitive ranking system skips next index)
  for (let i = 0; i < allSubmissions.length; i++) {
    if (i > 0 && allSubmissions[i].submissionTimeMs === allSubmissions[i - 1].submissionTimeMs) {
      allSubmissions[i].individualRank = allSubmissions[i - 1].individualRank;
    } else {
      allSubmissions[i].individualRank = i + 1;
    }
    allSubmissions[i].points = getDynamicPoints(allSubmissions[i].individualRank, N);
  }

  const teamScores = activeTeams.map(team => {
    const teamSubmissions = allSubmissions.filter(s => s.teamNumber === team.teamNumber);

    const solvesCount = teamSubmissions.length;
    const totalPlayers = team.players ? team.players.length : 0;
    
    // Extrapolate core metrics based on player performance limits
    const teamPoints = teamSubmissions.reduce((sum, s) => sum + s.points, 0);
    const teamTotalTimeMs = teamSubmissions.reduce((sum, s) => sum + s.submissionTimeMs, 0);
    const bestIndividualRank = teamSubmissions.length > 0 
      ? Math.min(...teamSubmissions.map(s => s.individualRank))
      : 999999;

    return {
      teamNumber: team.teamNumber,
      solvesCount,
      totalPlayers,
      teamPoints,
      teamTotalTimeMs,
      bestIndividualRank,
      rank: 0, // computed after rigorous sort
      playerSolves: teamSubmissions.map(s => {
        const pObj = team.players.find(p => p.userId === s.userId);
        return {
          userId: s.userId,
          username: pObj ? pObj.username : s.userId,
          teamNumber: team.teamNumber,
          submissionTimeMs: s.submissionTimeMs,
          rank: s.individualRank,
          points: s.points
        };
      })
    };
  });

  // Sort algorithm targeting precise Esports rules
  teamScores.sort((a, b) => {
    // 1. Total Points (Descending)
    if (b.teamPoints !== a.teamPoints) return b.teamPoints - a.teamPoints;
    // 2. Combined Time (Ascending - Faster is better)
    if (a.teamTotalTimeMs !== b.teamTotalTimeMs) return a.teamTotalTimeMs - b.teamTotalTimeMs;
    // 3. Best Submitting Rank (Ascending - Rank 1 beats 2)
    if (a.bestIndividualRank !== b.bestIndividualRank) return a.bestIndividualRank - b.bestIndividualRank;
    // 4. Number of Completed Solves
    return b.solvesCount - a.solvesCount;
  });

  // Stamp output ranks sequentially
  teamScores.forEach((t, idx) => { t.rank = idx + 1; });

  // Append eliminated teams seamlessly
  const eliminatedTeams = state.teams
    .filter(t => t.status === 'eliminated')
    .map(t => ({
      teamNumber: t.teamNumber,
      solvesCount: 0,
      totalPlayers: t.players ? t.players.length : 0,
      teamPoints: 0,
      teamTotalTimeMs: 0,
      bestIndividualRank: 999999,
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
    isFinalRound: advancingTeams.length <= 1 || round >= state.totalRounds,
    waitingForAdmin: !(advancingTeams.length <= 1 || round >= state.totalRounds) // non-final rounds wait for admin
  });

  console.log(`[BREngine] Round ${round} ended: ${advancingTeams.length} advance, ${eliminatedTeams.length} eliminated`);

  // Check if match is over
  if (advancingTeams.length <= 1 || round >= state.totalRounds) {
    // Wait briefly before showing final results
    setTimeout(() => finishBattleRoyale(roomId), 5000);
  } else {
    // Fix 9: Do NOT auto-start next round. Wait for admin to trigger it.
    state.status = 'waiting-for-admin';
    console.log(`[BREngine] Round ${round} ended. Waiting for admin to start next round.`);
  }
}

/**
 * Start the next round — called by admin via adminStartNextRound() or directly.
 * Fix 10: Ensures complete state reset between rounds.
 */
async function startNextBRRound(roomId) {
  const state = brStates.get(roomId);
  if (!state || state.status === 'finished') return;

  state.currentRound += 1;
  const round = state.currentRound;
  const difficulty = difficultyForRound(round, state.baseDifficulty);

  // Fix 6: Per-round duration
  const roundDuration = BR_ROUND_DURATIONS[round] || BR_ROUND_DURATION_SECONDS;

  // Get new question
  const question = await getRandomQuestion(difficulty);
  state.roundQuestion = question;

  // Notify server.js about the new question for submit-code handler
  if (_onQuestionChange) _onQuestionChange(roomId, question);

  // Fix 10: Complete state reset between rounds
  state.roundSubmissions = new Map();
  state.roundAttempts = new Map();
  state.roundSubmittedPlayers = new Set();  // Fix 11: reset submitted tracking
  state.roundStartedAt = Date.now();
  state.roundDurationSeconds = roundDuration;
  state.roundTimerEndAt = Date.now() + roundDuration * 1000;
  state.status = 'active';

  const leaderboard = computeTeamLeaderboard(state);

  // Broadcast new round
  _io.to(roomId).emit('br-round-started', {
    roomId,
    round,
    totalRounds: state.totalRounds,
    question: sanitizeQuestion(question),
    timerDuration: roundDuration,
    difficulty,
    leaderboard,
    activeTeams: state.teams.filter(t => t.status === 'active').map(t => t.teamNumber)
  });

  // Start timer
  startRoundTimer(roomId);

  console.log(`[BREngine] Round ${round} started (difficulty: ${difficulty}, duration: ${roundDuration}s)`);
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

// ── Early Round Termination ─────────────────────────────────────

/**
 * Fix 8/11: Check if all active players have submitted (correct or incorrect).
 * If so, end the round immediately.
 */
function checkEarlyTermination(roomId, state) {
  if (!state || state.status !== 'active') return;

  const activePlayersCount = state.teams
    .filter(t => t.status === 'active')
    .reduce((acc, t) => acc + t.players.length, 0);

  const submittedCount = state.roundSubmittedPlayers ? state.roundSubmittedPlayers.size : 0;

  if (submittedCount >= activePlayersCount && activePlayersCount > 0) {
    console.log(`[BREngine] All ${activePlayersCount} active players have submitted. Terminating round ${state.currentRound} early.`);

    // Fix 8: Use state.roundTimerInterval (not the non-existent roundTimers Map)
    if (state.roundTimerInterval) {
      clearInterval(state.roundTimerInterval);
      state.roundTimerInterval = null;
    }

    // Execute round end immediately
    endBRRound(roomId);
  }
}

/**
 * Admin-triggered next round start. Called from server.js after countdown.
 */
async function adminStartNextRound(roomId) {
  const state = brStates.get(roomId);
  if (!state) return;
  if (state.status !== 'waiting-for-admin' && state.status !== 'between-rounds') {
    console.warn(`[BREngine] adminStartNextRound called but status is ${state.status}`);
    return;
  }
  await startNextBRRound(roomId);
}

// ── Handle Player Leave / Disconnect ────────────────────────────

/**
 * Mark a disconnected/leaving player as "submitted" so the round
 * can end early instead of making everyone wait for the full timer.
 */
function handlePlayerLeave(roomId, socketId) {
  const state = brStates.get(roomId);
  if (!state || state.status !== 'active') return;

  // Find the player's team
  let playerTeam = null;
  for (const team of state.teams) {
    if (team.status !== 'active') continue;
    const found = team.players.find(p => p.socketId === socketId);
    if (found) {
      playerTeam = team;
      break;
    }
  }

  if (!playerTeam) return; // Player not in an active team

  // Remove the player from the team completely
  playerTeam.players = playerTeam.players.filter(p => p.socketId !== socketId);
  console.log(`[BREngine] Player ${socketId} left/disconnected — removed from Team ${playerTeam.teamNumber}`);

  // If the team is now empty, eliminate the whole team
  if (playerTeam.players.length === 0) {
    playerTeam.status = 'eliminated';
    playerTeam.eliminatedInRound = state.currentRound;
    console.log(`[BREngine] Team ${playerTeam.teamNumber} has no players left — eliminated in round ${state.currentRound}`);
  } else {
    // Notify room that player left
    if (_io) {
      _io.to(roomId).emit('br-match-state', getBRState(roomId));
    }
  }

  // Check if all remaining active players have now submitted
  checkEarlyTermination(roomId, state);
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  init,
  initBattleRoyale,
  handleBRSubmission,
  computeTeamLeaderboard,
  endBRRound,
  startNextBRRound,
  adminStartNextRound,
  finishBattleRoyale,
  getBRState,
  hasBRState,
  getBRMatchType,
  checkEarlyTermination,
  handlePlayerLeave,
  BR_ROUND_DURATION_SECONDS,
  BR_ROUND_DURATIONS,
  BR_INTERMISSION_SECONDS
};
