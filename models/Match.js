const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['1v1', '2v2', 'battle-royale'], required: true },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  playerSocketIds: [String],
  teams: {
    red: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  winner: mongoose.Schema.Types.ObjectId,
  winnerTeam: String,
  winners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Per-player results
  results: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    solved: { type: Boolean, default: false },
    timeTaken: Number,         // milliseconds from match start
    attempts: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    hiddenTestsPassed: { type: Boolean, default: false },
    accuracy: { type: Number, default: 0 }  // 0-100
  }],

  // Rating changes recorded after match
  ratingChanges: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ratingBefore: Number,
    ratingAfter: Number,
    delta: Number
  }],

  // Full submission log for AI analysis
  submissionLog: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attempt: Number,
    timestamp: Date,
    correct: Boolean,
    timeTakenMs: Number,
    judgeStatus: String,
    stderr: String,
    stdout: String
  }],

  // Aggregate analytics
  analytics: {
    avgAttempts: Number,
    fastestSolveMs: Number,
    totalSubmissions: Number,
    topicTags: [String]
  },

  // Timer metadata (set by server)
  timerDurationSeconds: Number,
  timerEndAt: Date,

  status: { type: String, enum: ['waiting', 'active', 'finished', 'cancelled'], default: 'waiting' },
  endReason: { type: String, enum: ['solved', 'timeout', 'forfeit', 'disconnect', 'draw'], default: 'solved' },
  startedAt: Date,
  finishedAt: Date,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Match', matchSchema);
