const mongoose = require('mongoose');

const brSubmissionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  teamNumber: Number,
  correct: Boolean,
  submissionTimeMs: Number, // ms from round start
  attempt: Number,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const brTeamScoreSchema = new mongoose.Schema({
  teamNumber: Number,
  solvesCount: { type: Number, default: 0 },
  totalTimeMs: { type: Number, default: 0 },
  rank: Number,
  advanced: { type: Boolean, default: false }
}, { _id: false });

const brRoundSchema = new mongoose.Schema({
  roundNumber: Number,
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  difficulty: String,
  startedAt: Date,
  endedAt: Date,
  durationSeconds: Number,
  submissions: [brSubmissionSchema],
  teamScores: [brTeamScoreSchema]
}, { _id: false });

const brPlayerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  socketId: String
}, { _id: false });

const brTeamSchema = new mongoose.Schema({
  teamNumber: Number,
  players: [brPlayerSchema],
  status: { type: String, enum: ['active', 'eliminated'], default: 'active' },
  eliminatedInRound: { type: Number, default: null }
}, { _id: false });

const brFinalRankingSchema = new mongoose.Schema({
  teamNumber: Number,
  rank: Number,
  totalSolves: { type: Number, default: 0 },
  totalTimeMs: { type: Number, default: 0 },
  roundsSurvived: { type: Number, default: 0 }
}, { _id: false });

const battleRoyaleMatchSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  customRoomId: { type: String },
  teams: [brTeamSchema],
  rounds: [brRoundSchema],
  eliminationSchedule: [{
    round: Number,
    advanceCount: Number
  }],
  currentRound: { type: Number, default: 1 },
  totalRounds: { type: Number, default: 3 },
  status: {
    type: String,
    enum: ['active', 'between-rounds', 'finished'],
    default: 'active'
  },
  winnerTeam: { type: Number, default: null },
  finalRankings: [brFinalRankingSchema],
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date
});

module.exports = mongoose.model('BattleRoyaleMatch', battleRoyaleMatchSchema);
