const express = require('express');
const User = require('../models/User');
const Match = require('../models/Match');
const authenticateToken = require('../middleware/authenticateToken'); // ✅ FIX
const { chatWithTutor, analyzePerformance } = require('../services/aiTutor');

const router = express.Router();

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { messages = [], userId } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const resolvedUserId = req.userId || userId;
    if (!resolvedUserId) {
      return res.status(401).json({ error: 'Unauthorized request.' });
    }

    const user = await User.findById(resolvedUserId)
      .select('username rating level xp skills weakTopics wins losses matches streak practiceRecommendations');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recentMatches = await Match.find({ players: resolvedUserId })
      .sort({ timestamp: -1 })
      .limit(5)
      .populate('question', 'title difficulty description')
      .select('type question timestamp results');

    const performance = await analyzePerformance(user, recentMatches);

    const reply = await chatWithTutor(messages, {
      user,
      performance,
      matches: recentMatches
    });

    res.json({ reply });
  } catch (error) {
    console.error('AI Tutor Chat Error:', error.message);
    res.status(500).json({
      error: 'AI Tutor failed. Please try again in a moment.'
    });
  }
});

module.exports = router;
