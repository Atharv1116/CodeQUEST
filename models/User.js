const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  college: { type: String, default: '' },
  socketId: String,

  // Rating & Stats
  rating: { type: Number, default: 1000 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  matches: { type: Number, default: 0 },

  // Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  coins: { type: Number, default: 100 },
  streak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastPlayDate: Date,
  badges: [{ type: String }],
  avatar: { type: String, default: 'default' },
  skins: [{ type: String }],

  // Skills Analytics
  skills: {
    algorithms: { type: Number, default: 0 },
    dataStructures: { type: Number, default: 0 },
    debugging: { type: Number, default: 0 },
    speed: { type: Number, default: 0 }
  },

  // AI Tutor Data
  weakTopics: [{ type: String }],
  practiceRecommendations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  aiFeedbackHistory: [{
    problemId: mongoose.Schema.Types.ObjectId,
    feedback: String,
    timestamp: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// REMOVED 'next' PARAMETER TO FIX CRASH
userSchema.pre('save', function () {
  this.updatedAt = Date.now();
  // Calculate level from XP (100 XP per level)
  this.level = Math.floor(this.xp / 100) + 1;
});

module.exports = mongoose.model('User', userSchema);
