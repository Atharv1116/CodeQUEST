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
 *
 * IMPORTANT: We do NOT send `expected_output` to Judge0.
 * Reason: Judge0 does a strict byte-level comparison which fails on trailing
 * newlines, whitespace differences, etc., producing "Wrong Answer" even when
 * the output is semantically correct.
 *
 * Instead, we manually compare stdout.trim() === expected_output.trim() after
 * receiving the result. This is far more reliable.
 *
 * Returns { correct, status, stdout, stderr, ... } — never throws.
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
        // Do NOT send expected_output — let Judge0 just run the code and
        // return the raw stdout. We compare ourselves below.
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

  // Polling loop — max 30 attempts, 1s apart
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

      // status.id >= 3 means done:
      //   3 = Accepted (code ran successfully)
      //   4 = Wrong Answer (only if we sent expected_output — we don't, so won't happen)
      //   5 = TLE, 6 = CE, 7-13 = RE, etc.
      if (data && statusId >= 3) {
        const stdoutTrimmed   = (data.stdout || '').trim();
        const expectedTrimmed = (expected_output || '').trim();

        // Only consider "correct" if:
        // 1. Code ran without runtime/compile error (status 3 or 4 — 4 can't happen now)
        // 2. Our trimmed comparison matches
        const ranCleanly = statusId === 3 || statusId === 4; // 4 won't occur since we don't send expected_output
        const correct = ranCleanly && expectedTrimmed !== '' && stdoutTrimmed === expectedTrimmed;

        console.log(
          `[Judge0] status=${data.status?.description} | got="${stdoutTrimmed}" | expected="${expectedTrimmed}" | correct=${correct}`
        );

        return { ...data, correct };
      }
    } catch (pollErr) {
      console.error('[Judge0] Poll error:', pollErr.message);
      // Keep polling — transient errors shouldn't abort
    }
  }

  // Timed-out polling
  console.error('[Judge0] Polling timed out for token:', token);
  return {
    status: { id: 4, description: 'Time limit exceeded waiting for Judge0' },
    correct: false,
    stdout: '',
    stderr: 'Execution timed out.'
  };
}

module.exports = { submitToJudge0, LANGUAGE_IDS };
