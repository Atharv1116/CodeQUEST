/**
 * Performance-Weighted Competitive ELO Engine
 * Mirrors Codeforces-style rating mechanics:
 *  - K-factor scales with rating tier (volatile at entry, stable at top)
 *  - Time bonus: faster correct solve → higher gain
 *  - Attempts penalty: each wrong submission reduces gain / increases loss
 *  - Rating floor: 0 (never negative)
 *  - Rating gap protection: beating a much weaker player gives minimal points
 */

// K-factor by rating tier
function getKFactor(rating) {
  if (rating < 800) return 50;  // New players: volatile
  if (rating < 1200) return 40;
  if (rating < 2000) return 32;  // Standard range
  return 16;                     // Elite: stable
}

/**
 * Calculate ELO delta for a 1v1 match.
 * @param {number} playerRating
 * @param {number} opponentRating
 * @param {number} outcome  - 1 = win, 0 = loss, 0.5 = draw
 * @param {number} solveTimeMs - time taken by player (ms), 0 if didn't solve
 * @param {number} matchDurationMs - total match duration (ms)
 * @param {number} wrongAttempts - number of wrong submissions before correct
 * @returns {number} rating delta for this player
 */
function calculateEloDelta(playerRating, opponentRating, outcome, solveTimeMs = 0, matchDurationMs = 1800000, wrongAttempts = 0) {
  const K = getKFactor(playerRating);
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const baseDelta = K * (outcome - expected);

  // Time modifier: scales from +10 (instant) to -5 (near time limit)
  // Only applies when the player actually solved (outcome = 1)
  let timeMod = 0;
  if (outcome === 1 && solveTimeMs > 0 && matchDurationMs > 0) {
    const ratio = Math.min(1, solveTimeMs / matchDurationMs);
    timeMod = 10 - 15 * ratio; // +10 at t=0, -5 at t=matchDuration
  }

  // Attempts penalty: -2 per wrong submission (only on win) or +1 penalty on loss per attempt
  const attemptsMod = outcome === 1
    ? -2 * wrongAttempts
    : -1 * wrongAttempts;

  const finalDelta = Math.round(baseDelta + timeMod + attemptsMod);
  return finalDelta;
}

/**
 * Calculate new ratings for both players in a 1v1 match.
 * @returns {{ winnerDelta, loserDelta, winnerNewRating, loserNewRating }}
 */
function calculateElo(winnerRating, loserRating, solveTimeMs = 0, matchDurationMs = 1800000, winnerAttempts = 0, loserAttempts = 0) {
  const winnerDelta = calculateEloDelta(winnerRating, loserRating, 1, solveTimeMs, matchDurationMs, winnerAttempts);
  const loserDelta = calculateEloDelta(loserRating, winnerRating, 0, 0, matchDurationMs, loserAttempts);

  return {
    winnerDelta,
    loserDelta,
    winnerNewRating: Math.max(0, winnerRating + winnerDelta),
    loserNewRating: Math.max(0, loserRating + loserDelta)
  };
}

/**
 * Calculate draw rating changes for both players.
 */
function calculateDrawElo(rating1, rating2, attempts1 = 0, attempts2 = 0) {
  const delta1 = calculateEloDelta(rating1, rating2, 0.5, 0, 1800000, attempts1);
  const delta2 = calculateEloDelta(rating2, rating1, 0.5, 0, 1800000, attempts2);
  return {
    delta1,
    delta2,
    newRating1: Math.max(0, rating1 + delta1),
    newRating2: Math.max(0, rating2 + delta2)
  };
}

/**
 * Calculate team ELO for 2v2 matches.
 * Uses average team rating for expected score calculation.
 * Each individual's K-factor is applied to their personal rating.
 */
function calculateTeamElo(team1Ratings, team2Ratings, team1Won, team1SolveMs = 0, matchDurationMs = 1800000, team1Attempts = [], team2Attempts = []) {
  const avg1 = team1Ratings.reduce((a, b) => a + b, 0) / team1Ratings.length;
  const avg2 = team2Ratings.reduce((a, b) => a + b, 0) / team2Ratings.length;

  const team1Results = team1Ratings.map((r, i) => {
    const delta = calculateEloDelta(
      r,
      avg2,
      team1Won ? 1 : 0,
      team1Won ? team1SolveMs : 0,
      matchDurationMs,
      team1Attempts[i] || 0
    );
    return { delta, newRating: Math.max(0, r + delta) };
  });

  const team2Results = team2Ratings.map((r, i) => {
    const delta = calculateEloDelta(
      r,
      avg1,
      team1Won ? 0 : 1,
      !team1Won ? team1SolveMs : 0,
      matchDurationMs,
      team2Attempts[i] || 0
    );
    return { delta, newRating: Math.max(0, r + delta) };
  });

  return {
    team1: team1Results.map(t => t.newRating),
    team2: team2Results.map(t => t.newRating),
    team1Deltas: team1Results.map(t => t.delta),
    team2Deltas: team2Results.map(t => t.delta)
  };
}

/**
 * Battle Royale rating: rank-based performance scoring.
 * Position 1 (winner) gets full win bonus, last place gets full loss penalty.
 * Opponents are treated as the "average field" rating.
 * @param {number} playerRating
 * @param {number} avgFieldRating
 * @param {number} position  - 1 = winner
 * @param {number} totalPlayers
 * @param {number} solveTimeMs
 * @param {number} matchDurationMs
 * @param {number} wrongAttempts
 */
function calculateBattleRoyaleElo(playerRating, avgFieldRating, position, totalPlayers, solveTimeMs = 0, matchDurationMs = 300000, wrongAttempts = 0) {
  // Normalize position to an outcome score: 1 = first, 0 = last
  const outcome = 1 - (position - 1) / Math.max(1, totalPlayers - 1);
  const delta = calculateEloDelta(playerRating, avgFieldRating, outcome, solveTimeMs, matchDurationMs, wrongAttempts);
  return {
    delta,
    newRating: Math.max(0, playerRating + delta)
  };
}

module.exports = {
  calculateElo,
  calculateDrawElo,
  calculateTeamElo,
  calculateBattleRoyaleElo,
  calculateEloDelta
};
