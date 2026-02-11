const Groq = require('groq-sdk');
const { getAITutorKey } = require('../config/secrets');

const DEFAULT_MODEL = process.env.AI_TUTOR_MODEL || 'llama-3.3-70b-versatile';

function getGroqClient() {
  const apiKey = getAITutorKey();
  if (!apiKey) {
    throw new Error('AI Tutor API key is missing. Add it to API key.txt or set GROQ_API_KEY.');
  }

  // Set the key in process.env for downstream libraries if needed
  process.env.GROQ_API_KEY = apiKey;

  // Always create a fresh client to ensure we use the latest key
  return new Groq({ apiKey });
}

function sanitizeMessages(messages = []) {
  return messages
    .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim().length > 0)
    .map((msg) => ({
      role: ['user', 'assistant', 'system'].includes(msg.role) ? msg.role : 'user',
      content: msg.content.trim()
    }));
}

async function chatWithTutor(messages, context = {}) {
  const client = getGroqClient();
  const { user, performance, matches } = context;

  const userSummary = user
    ? `Student: ${user.username}\nRating: ${user.rating || 'N/A'} | Level: ${user.level || 'N/A'} | Streak: ${user.streak || 0
    }\nWeak Topics: ${performance?.weakTopics?.join(', ') || 'unknown'}`
    : 'Student: Unknown';

  const matchSummary = matches && matches.length
    ? matches
      .map(
        (match, idx) =>
          `#${idx + 1}: ${match.type || 'mode'} on "${match.question?.title || 'Unknown'}" (${match.question?.difficulty || 'difficulty?'
          })`
      )
      .join('\n')
    : 'No recent matches recorded.';

  const systemPrompt = `You are CodeQuest AI Coach, a calm, encouraging tutor who helps competitive programmers improve.
Use the provided profile and recent performance to personalize your responses. Be specific, but concise.
If the student asks for code, guide them instead of dumping full solutions. Offer follow-up suggestions and practice ideas when relevant.

${userSummary}

Recent Matches:
${matchSummary}

When giving advice, tie it back to the student's goals, strengths, and weaknesses.`;

  const history = [{ role: 'system', content: systemPrompt }, ...sanitizeMessages(messages)];

  try {
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: history,
      temperature: 0.4,
      max_tokens: 600,
      presence_penalty: 0.1
    });

    return response.choices?.[0]?.message?.content?.trim() || 'I could not craft a reply. Please try again.';
  } catch (error) {
    console.error('AI Tutor chat error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(`Groq API Error: ${errorMessage}`);
  }
}

async function getAIFeedback(code, problem, error, userAttempts, customPrompt) {
  try {
    const client = getGroqClient();
    const prompt = customPrompt || `You are an AI coding tutor. A student is working on this problem:

Title: ${problem.title}
Description: ${problem.description}

Their code:
\`\`\`
${code}
\`\`\`

${error ? `Error/Issue: ${error}` : 'The code is incorrect.'}
Attempts: ${userAttempts}

Provide helpful, encouraging feedback. Point out what's wrong, suggest improvements, but don't give away the solution. Keep it concise (2-3 sentences).`;

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('AI Tutor error:', error.message);
    return "Keep trying! Review your logic and check edge cases. You've got this! 💪";
  }
}

async function getHint(problem, userProgress) {
  try {
    const client = getGroqClient();
    const prompt = `A student is stuck on this coding problem:

Title: ${problem.title}
Description: ${problem.description}
Difficulty: ${problem.difficulty}

They've been working on it for a while. Provide a helpful hint (not the solution) that guides them in the right direction. One sentence only.`;

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.7
    });
    return response.choices[0].message.content;
  } catch (error) {
    return "💡 Hint: Break the problem into smaller parts and solve each one.";
  }
}

async function recommendProblems(user, Question) {
  try {
    // Analyze weak topics
    const weakTopics = user.weakTopics || [];

    // Get problems matching weak topics
    let recommended = await Question.find({
      tags: { $in: weakTopics },
      difficulty: { $in: ['easy', 'medium'] }
    }).limit(5);

    // If not enough, get random medium difficulty problems
    if (recommended.length < 3) {
      const additional = await Question.find({
        difficulty: 'medium',
        _id: { $nin: recommended.map(q => q._id) }
      }).limit(5 - recommended.length);
      recommended = [...recommended, ...additional];
    }

    return recommended;
  } catch (error) {
    console.error('Recommendation error:', error);
    return [];
  }
}

async function analyzePerformance(user, matchHistory) {
  try {
    const analysis = {
      weakTopics: [],
      strongTopics: [],
      suggestions: []
    };

    // Simple analysis based on failed attempts
    // In production, you'd analyze actual problem tags and success rates

    if (user.skills.algorithms < 50) {
      analysis.weakTopics.push('algorithms');
      analysis.suggestions.push('Practice more algorithm problems to improve your problem-solving skills.');
    }

    if (user.skills.speed < 50) {
      analysis.suggestions.push('Try solving problems under time pressure to improve your coding speed.');
    }

    return analysis;
  } catch (error) {
    console.error('Performance analysis error:', error);
    return { weakTopics: [], strongTopics: [], suggestions: [] };
  }
}

module.exports = {
  getAIFeedback,
  getHint,
  recommendProblems,
  analyzePerformance,
  chatWithTutor
};
