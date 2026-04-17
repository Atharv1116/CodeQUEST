const axios = require('axios');

const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '1331538818msh94e20c66f87ea29p1905fcjsnf6c4c3ee1062';
const JUDGE0_HOST = process.env.JUDGE0_HOST || 'judge0-ce.p.rapidapi.com';
const JUDGE0_BASE = `https://${JUDGE0_HOST}`;

// Language IDs mapping
const LANGUAGE_IDS = {
  python: 71,
  python3: 71,
  javascript: 63,
  java: 62,
  cpp: 54,
  'c++': 54,
  c: 50
};

/**
 * Submit code to Judge0 and poll for the result.
 * Returns a result object with { correct, status, stdout, stderr, ... }
 * Never throws — returns { correct: false, error: 'message' } on failure.
 */
async function submitToJudge0({ source_code, language_id, stdin, expected_output, time_limit = 5 }) {
  const headers = {
    'X-RapidAPI-Key': JUDGE0_API_KEY,
    'X-RapidAPI-Host': JUDGE0_HOST,
    'Content-Type': 'application/json'
  };

  let token;
  try {
    const postResp = await axios.post(
      `${JUDGE0_BASE}/submissions?base64_encoded=false&wait=false`,
      {
        source_code,
        language_id,
        stdin: stdin || '',
        expected_output: expected_output || '',
        cpu_time_limit: time_limit,
        wall_time_limit: time_limit + 3
      },
      { headers, timeout: 15000 }
    );

    token = postResp.data?.token;
    if (!token) {
      console.error('[Judge0] No token in response:', JSON.stringify(postResp.data));
      return { correct: false, status: { id: 0, description: 'No token from Judge0' }, stdout: '', stderr: '' };
    }
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    console.error(`[Judge0] POST failed (${status}):`, body || err.message);

    if (status === 401 || status === 403) {
      return { correct: false, status: { id: 0, description: 'Judge0 API key invalid or expired' }, stdout: '', stderr: 'API authentication failed.' };
    }
    if (status === 429) {
      return { correct: false, status: { id: 0, description: 'Judge0 rate limit exceeded' }, stdout: '', stderr: 'Too many requests. Please wait and try again.' };
    }
    return { correct: false, status: { id: 0, description: `Judge0 POST error: ${err.message}` }, stdout: '', stderr: err.message };
  }

  // Polling loop — max 30 attempts, 1s apart (handles slow servers)
  for (let tries = 0; tries < 30; tries++) {
    await new Promise(r => setTimeout(r, 1000));

    try {
      const res = await axios.get(
        `${JUDGE0_BASE}/submissions/${token}`,
        {
          headers,
          params: { base64_encoded: 'false', fields: '*' },
          timeout: 10000
        }
      );

      const data = res.data;
      const statusId = data?.status?.id;

      // status.id >= 3 means done (Accepted, WA, TLE, CE, RE, etc.)
      if (data && statusId >= 3) {
        const stdoutTrimmed   = (data.stdout || '').trim();
        const expectedTrimmed = (expected_output || '').trim();

        // Judge0 marks Accepted (3) if expected_output was provided AND matches
        // We also do our own comparison as a fallback
        const correct = statusId === 3
          ? (data.stdout != null && stdoutTrimmed === expectedTrimmed)
          : false;

        if (!correct) {
          console.log(
            `[Judge0] Wrong: status=${data.status?.description}, got="${stdoutTrimmed}", expected="${expectedTrimmed}"`
          );
        }
        return { ...data, correct };
      }
    } catch (pollErr) {
      console.error('[Judge0] Poll error:', pollErr.message);
      // Keep polling — transient network errors shouldn't abort
    }
  }

  // Timed-out waiting for result
  console.error('[Judge0] Polling timed out for token:', token);
  return {
    status: { id: 4, description: 'Time limit exceeded waiting for Judge0' },
    correct: false,
    stdout: '',
    stderr: 'Execution timed out.'
  };
}

module.exports = { submitToJudge0, LANGUAGE_IDS };
