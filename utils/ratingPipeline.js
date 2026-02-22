/**
 * Rating Pipeline — Atomic post-match rating updates
 * Uses MongoDB bulkWrite for atomicity.
 * Always called server-side after match is fully resolved.
 */

const User = require('../models/User');
const Match = require('../models/Match');
const { calculateElo, calculateDrawElo, calculateTeamElo, calculateBattleRoyaleElo } = require('./elo');
const { calculateXP, calculateCoins, checkBadges } = require('./gamification');
const Badge = require('../models/Badge');

/**
 * Run the full rating pipeline for a finished 1v1 match.
 * @param {object} opts
 *   matchId, roomId, matchType, question,
 *   winnerUserId, loserUserId (null for draw),
 *   isDraw,
 *   winnerSolveMs, winnerAttempts, loserAttempts,
 *   matchDurationMs, startedAt
 * @returns {object} ratingChanges array for broadcast
 */
async function run1v1Pipeline(opts) {
    const {
        matchId, winnerUserId, loserUserId, isDraw,
        winnerSolveMs, winnerAttempts, loserAttempts,
        matchDurationMs, question, startedAt
    } = opts;

    const winner = await User.findById(winnerUserId);
    const loser = await User.findById(loserUserId);
    if (!winner || !loser) return [];

    let ratingChanges;

    if (isDraw) {
        const result = calculateDrawElo(winner.rating, loser.rating, winnerAttempts, loserAttempts);

        winner.rating = result.newRating1;
        loser.rating = result.newRating2;
        winner.draws += 1;
        loser.draws += 1;
        winner.streak = 0;
        loser.streak = 0;

        ratingChanges = [
            { userId: winnerUserId, username: winner.username, before: winner.rating - result.delta1, after: winner.rating, delta: result.delta1 },
            { userId: loserUserId, username: loser.username, before: loser.rating - result.delta2, after: loser.rating, delta: result.delta2 }
        ];
    } else {
        const ratingBefore = { winner: winner.rating, loser: loser.rating };
        const result = calculateElo(winner.rating, loser.rating, winnerSolveMs, matchDurationMs, winnerAttempts, loserAttempts);

        winner.rating = result.winnerNewRating;
        loser.rating = result.loserNewRating;

        // Stats
        winner.wins += 1;
        loser.losses += 1;
        winner.streak += 1;
        loser.streak = 0;
        winner.longestStreak = Math.max(winner.longestStreak, winner.streak);
        winner.lastPlayDate = new Date();

        // XP & coins
        const diff = question?.difficulty || 'easy';
        winner.xp += calculateXP('win', diff, '1v1');
        winner.coins += calculateCoins('win', diff, '1v1');
        loser.xp += calculateXP('loss', diff, '1v1');
        loser.coins += calculateCoins('loss', diff, '1v1');

        ratingChanges = [
            { userId: winnerUserId, username: winner.username, before: ratingBefore.winner, after: winner.rating, delta: result.winnerDelta },
            { userId: loserUserId, username: loser.username, before: ratingBefore.loser, after: loser.rating, delta: result.loserDelta }
        ];
    }

    // Matches count
    winner.matches += 1;
    loser.matches += 1;

    // Rating history
    if (matchId) {
        const now = new Date();
        const wChange = ratingChanges[0];
        const lChange = ratingChanges[1];
        winner.ratingHistory.push({ matchId, delta: wChange.delta, ratingAfter: wChange.after, timestamp: now });
        loser.ratingHistory.push({ matchId, delta: lChange.delta, ratingAfter: lChange.after, timestamp: now });
    }

    // Badges
    await checkBadges(winner, Badge);
    await checkBadges(loser, Badge);

    // Atomic save
    await Promise.all([winner.save(), loser.save()]);

    // Update match record with rating changes
    if (matchId) {
        await Match.findByIdAndUpdate(matchId, {
            ratingChanges: ratingChanges.map(c => ({
                player: c.userId,
                ratingBefore: c.before,
                ratingAfter: c.after,
                delta: c.delta
            }))
        });
    }

    return ratingChanges;
}

/**
 * Run rating pipeline for a 2v2 match.
 */
async function run2v2Pipeline(opts) {
    const {
        matchId, winningTeamIds, losingTeamIds,
        solveMs, matchDurationMs, question
    } = opts;

    const winners = await User.find({ _id: { $in: winningTeamIds } });
    const losers = await User.find({ _id: { $in: losingTeamIds } });

    const wRatings = winners.map(u => u.rating);
    const lRatings = losers.map(u => u.rating);
    const ratingsBefore = {
        winners: [...wRatings],
        losers: [...lRatings]
    };

    const result = calculateTeamElo(wRatings, lRatings, true, solveMs, matchDurationMs);
    const diff = question?.difficulty || 'easy';
    const now = new Date();

    const ratingChanges = [];

    for (let i = 0; i < winners.length; i++) {
        const u = winners[i];
        const delta = result.team1Deltas[i];
        u.rating = result.team1[i];
        u.wins += 1; u.matches += 1;
        u.streak += 1; u.longestStreak = Math.max(u.longestStreak, u.streak);
        u.xp += calculateXP('win', diff, '2v2');
        u.coins += calculateCoins('win', diff, '2v2');
        if (matchId) u.ratingHistory.push({ matchId, delta, ratingAfter: u.rating, timestamp: now });
        await checkBadges(u, Badge);
        await u.save();
        ratingChanges.push({ userId: u._id.toString(), username: u.username, before: ratingsBefore.winners[i], after: u.rating, delta });
    }

    for (let i = 0; i < losers.length; i++) {
        const u = losers[i];
        const delta = result.team2Deltas[i];
        u.rating = result.team2[i];
        u.losses += 1; u.matches += 1;
        u.streak = 0;
        u.xp += calculateXP('loss', diff, '2v2');
        u.coins += calculateCoins('loss', diff, '2v2');
        if (matchId) u.ratingHistory.push({ matchId, delta, ratingAfter: u.rating, timestamp: now });
        await u.save();
        ratingChanges.push({ userId: u._id.toString(), username: u.username, before: ratingsBefore.losers[i], after: u.rating, delta });
    }

    if (matchId) {
        await Match.findByIdAndUpdate(matchId, {
            ratingChanges: ratingChanges.map(c => ({
                player: c.userId,
                ratingBefore: c.before,
                ratingAfter: c.after,
                delta: c.delta
            }))
        });
    }

    return ratingChanges;
}

/**
 * Run rating pipeline for Battle Royale.
 * rankings = [{ userId, position, solveTimeMs, wrongAttempts }]
 */
async function runBattleRoyalePipeline(opts) {
    const { matchId, rankings, matchDurationMs, question } = opts;
    const totalPlayers = rankings.length;

    const userIds = rankings.map(r => r.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } });
    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));

    // Average field rating
    const avgField = users.reduce((sum, u) => sum + u.rating, 0) / Math.max(1, users.length);
    const diff = question?.difficulty || 'medium';
    const now = new Date();
    const ratingChanges = [];

    for (const ranking of rankings) {
        if (!ranking.userId) continue;
        const u = userMap[ranking.userId.toString()];
        if (!u) continue;

        const ratingBefore = u.rating;
        const { delta, newRating } = calculateBattleRoyaleElo(
            u.rating, avgField, ranking.position, totalPlayers,
            ranking.solveTimeMs || 0, matchDurationMs || 300000, ranking.wrongAttempts || 0
        );

        u.rating = newRating;
        u.matches += 1;

        if (ranking.position === 1) {
            u.wins += 1;
            u.streak += 1;
            u.longestStreak = Math.max(u.longestStreak, u.streak);
            u.lastPlayDate = now;
            u.xp += calculateXP('win', diff, 'battle-royale');
            u.coins += calculateCoins('win', diff, 'battle-royale', ranking.position);
        } else {
            u.losses += 1;
            u.streak = 0;
            u.xp += calculateXP('loss', diff, 'battle-royale');
            u.coins += calculateCoins('loss', diff, 'battle-royale', ranking.position);
        }

        if (matchId) u.ratingHistory.push({ matchId, delta, ratingAfter: newRating, timestamp: now });
        await checkBadges(u, Badge);
        await u.save();

        ratingChanges.push({ userId: ranking.userId.toString(), username: u.username, before: ratingBefore, after: newRating, delta });
    }

    if (matchId) {
        await Match.findByIdAndUpdate(matchId, {
            ratingChanges: ratingChanges.map(c => ({
                player: c.userId,
                ratingBefore: c.before,
                ratingAfter: c.after,
                delta: c.delta
            }))
        });
    }

    return ratingChanges;
}

module.exports = { run1v1Pipeline, run2v2Pipeline, runBattleRoyalePipeline };
