const fs = require('fs');
const path = require('path');

let cachedSecrets = null;

function loadSecretsFromFile() {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const secretsPath = path.join(__dirname, '..', 'API key.txt');

  try {
    const raw = fs.readFileSync(secretsPath, 'utf8');
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    cachedSecrets = entries.reduce((acc, line) => {
      const [label, ...rest] = line.split(':');
      if (!label || !rest.length) {
        return acc;
      }
      const key = rest.join(':').trim();
      acc[label.trim().toLowerCase()] = key;
      return acc;
    }, {});
  } catch (error) {
    cachedSecrets = {};
  }

  return cachedSecrets;
}

function getAITutorKey() {
  const envKey = process.env.GROQ_API_KEY;
  if (envKey) {
    return envKey.trim();
  }

  const secrets = loadSecretsFromFile();
  return secrets['ai tutor'] || secrets['ai_tutor'];
}

function getJudge0Key() {
  const envKey = process.env.JUDGE0_API_KEY;
  if (envKey) {
    return envKey.trim();
  }

  const secrets = loadSecretsFromFile();
  return secrets['judge0'] || secrets['judge0 api'] || secrets['judge0 key'];
}

module.exports = {
  getAITutorKey,
  getJudge0Key
};
