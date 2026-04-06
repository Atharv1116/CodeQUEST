import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, TrendingDown, Minus, Clock, Target, Zap, Coins, Lightbulb } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const MatchResult = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();  // Must be called before any early returns (Rules of Hooks)
  const { matchResult: initialMatchResult, winner: winnerState, questionTitle } = location.state || {};

  // Local state so we can patch in late-arriving data (e.g. rating-update)
  const [matchResult, setMatchResult] = useState(initialMatchResult || null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Listen for late-arriving rating-update events
  useEffect(() => {
    if (!socket) return;
    const handleRatingUpdate = ({ matchId, ratingChanges }) => {
      console.log('[MatchResult] rating-update received:', matchId, ratingChanges);
      setMatchResult(prev => prev ? {
        ...prev,
        matchId: matchId || prev.matchId,
        ratingChanges: ratingChanges?.length > 0 ? ratingChanges : prev.ratingChanges
      } : prev);
    };
    socket.on('rating-update', handleRatingUpdate);
    return () => socket.off('rating-update', handleRatingUpdate);
  }, [socket]);

  useEffect(() => {
    if (!matchResult && !winnerState) {
      navigate('/lobby');
    }
  }, [matchResult, winnerState, navigate]);

  if (!matchResult && !winnerState) return null;

  const isWin = winnerState === 'you';
  const isDraw = winnerState === 'draw';
  const isLoss = winnerState === 'opponent' || winnerState === 'loss';

  // Use authenticated user id to pick OWN stats row (most reliable)
  const myUserId = user?.id?.toString() || user?._id?.toString();

  // ── Rating row ──────────────────────────────────────────────────
  const myRatingRow = (() => {
    let rowObj = null;
    if (matchResult?.ratingChanges?.length) {
      if (myUserId) {
        rowObj = matchResult.ratingChanges.find(r => r.userId?.toString() === myUserId);
      }
      if (!rowObj) {
        if (isWin) rowObj = matchResult.ratingChanges.find(r => (r.delta ?? 0) > 0) || matchResult.ratingChanges[0];
        else if (isDraw) rowObj = matchResult.ratingChanges[0];
        else rowObj = matchResult.ratingChanges.find(r => (r.delta ?? 0) <= 0) || matchResult.ratingChanges[matchResult.ratingChanges.length - 1];
      }
    }
    return rowObj || { before: 0, after: 0, delta: 0 }; // Fallback to avoid vanishing UI
  })();

  const delta = myRatingRow ? (myRatingRow.delta ?? (myRatingRow.after - myRatingRow.before)) : null;

  // ── XP / Coins ────────────────────────────────────────────────
  const xpGained = isWin ? matchResult?.xpChanges?.winner?.xp : matchResult?.xpChanges?.loser?.xp;
  const coinsGained = isWin ? matchResult?.xpChanges?.winner?.coins : matchResult?.xpChanges?.loser?.coins;

  // ── My Stats (solve time & attempts) ─────────────────────────
  // Priority: perPlayerStats[myUserId] → stats.winner/loser slot → null
  const myStats = (() => {
    // 1. Per-player keyed stats (server sends since this fix)
    if (myUserId && matchResult?.perPlayerStats?.[myUserId]) {
      return matchResult.perPlayerStats[myUserId];
    }
    // 2. Slot-based fallback — winner sees winner slot, loser sees loser slot
    if (isWin)   return matchResult?.stats?.winner ?? null;
    if (isLoss)  return matchResult?.stats?.loser  ?? null;
    return matchResult?.stats?.winner ?? null; // draw
  })();

  const solveMs  = myStats?.solveTimeMs ?? null;   // null if not solved (loser)
  const solveSec = (solveMs != null && solveMs > 0) ? Math.round(solveMs / 1000) : null;
  const attempts = myStats?.attempts ?? (isWin ? 1 : '—');

  // Visual Theme mapping based on outcome
  const theme = isWin 
    ? { color: 'text-primary', border: 'border-primary', bg: 'bg-primary/10', glow: 'shadow-primary/30' }
    : isDraw 
      ? { color: 'text-gray-400', border: 'border-gray-500', bg: 'bg-gray-500/10', glow: 'shadow-gray-500/20' }
      : { color: 'text-red-500', border: 'border-red-500', bg: 'bg-red-500/10', glow: 'shadow-red-500/30' };

  const handleFetchAnalysis = async () => {
    setShowAnalysis(true);
    if (!matchResult?.matchId || aiAnalysis) return; // already fetched or no id
    
    setAiAnalysisLoading(true);
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const resp = await axios.get(`${API_URL}/api/match/${matchResult.matchId}/ai-analysis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.data.ok) setAiAnalysis(resp.data);
    } catch (e) {
      console.error('[MatchResult] AI analysis fetch failed:', e);
      setAiAnalysis({ analysis: 'Analysis unavailable. Please review your code manually.' });
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] opacity-10 ${
        isWin ? 'bg-primary' : isLoss ? 'bg-red-500' : 'bg-gray-500'
      } pointer-events-none`} />

      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        className={`glass p-8 md:p-12 rounded-2xl w-full max-w-4xl relative z-10 border-t border-l border-white/10 ${theme.border} border-opacity-30 shadow-2xl ${theme.glow}`}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className={`mx-auto mb-4 flex items-center justify-center w-24 h-24 rounded-full ${theme.bg} border ${theme.border} shadow-[0_0_30px_rgba(0,0,0,0.3)] shadow-${isWin ? 'primary/40' : 'red-500/40'}`}
          >
            {isWin ? <Trophy size={48} className={theme.color} /> : isDraw ? <Minus size={48} className={theme.color} /> : <span className={`text-5xl font-extrabold ${theme.color}`}>✖</span>}
          </motion.div>
          
          <h1 className={`text-5xl font-black uppercase tracking-widest ${theme.color} mb-2`}>
            {isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT'}
          </h1>
          <p className="text-gray-400 text-lg uppercase tracking-widest font-semibold">
            {questionTitle || 'Match Completed'}
          </p>
          <p className="text-gray-500 text-sm mt-2">{matchResult?.message}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-dark-800/80 backdrop-blur border border-dark-600 rounded-xl p-6 text-center shadow-lg transform hover:-translate-y-1 transition duration-300"
          >
            <Clock className="mx-auto mb-3 text-cyan-400" size={28} />
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Solve Time</p>
            <p className="text-2xl font-black text-white">
              {solveSec != null
                ? solveSec >= 60 ? `${Math.floor(solveSec / 60)}m ${solveSec % 60}s` : `${solveSec}s`
                : '—'}
            </p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-dark-800/80 backdrop-blur border border-dark-600 rounded-xl p-6 text-center shadow-lg transform hover:-translate-y-1 transition duration-300"
          >
            <Target className="mx-auto mb-3 text-purple-400" size={28} />
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Attempts</p>
            <p className="text-2xl font-black text-white">{attempts}</p>
          </motion.div>

          {/* XP */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="bg-dark-800/80 backdrop-blur border border-dark-600 rounded-xl p-6 text-center shadow-lg transform hover:-translate-y-1 transition duration-300 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500/5 to-transparent pointer-events-none" />
            <Zap className="mx-auto mb-3 text-blue-400" size={28} />
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">XP Gained</p>
            <p className="text-2xl font-black text-blue-400">+{xpGained ?? 0}</p>
          </motion.div>

          {/* Coins */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="bg-dark-800/80 backdrop-blur border border-dark-600 rounded-xl p-6 text-center shadow-lg transform hover:-translate-y-1 transition duration-300 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/5 to-transparent pointer-events-none" />
            <Coins className="mx-auto mb-3 text-yellow-400" size={28} />
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Coins</p>
            <p className="text-2xl font-black text-yellow-400">+{coinsGained ?? 0}</p>
          </motion.div>
        </div>

        {/* Rating Changes List Component */}
        {matchResult?.ratingChanges?.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            className="bg-dark-800/60 backdrop-blur border border-dark-600 rounded-xl p-6 mb-8 shadow-inner"
          >
            <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" /> Player Ratings
            </h3>
            <div className="space-y-3">
              {matchResult.ratingChanges.map((r, i) => {
                const rDelta = r.delta ?? (r.after - r.before);
                const rNew = r.after ?? r.newRating;
                const rOld = r.before ?? r.oldRating;
                const isPositive = rDelta >= 0;
                
                return (
                  <div key={i} className="flex items-center justify-between p-4 bg-dark-900/50 rounded-lg border border-dark-700/50 hover:bg-dark-700 transition">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg bg-dark-600 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {r.username ? r.username[0].toUpperCase() : '?'}
                      </div>
                      <div>
                        <p className="font-bold text-white text-base tracking-wide">{r.username || 'Player'}</p>
                        <p className="text-xs font-mono text-gray-500 mt-1">{rOld} <span className="mx-1">→</span> {rNew}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-black text-lg ${isPositive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                      {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      {isPositive ? '+' : ''}{rDelta}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Actions Button */}
        {!showAnalysis ? (
          <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
             className="flex flex-col sm:flex-row gap-4 mt-8"
          >
            <button
              onClick={() => navigate('/lobby')}
              className="flex-1 bg-dark-700 border border-dark-500 text-white py-4 rounded-xl font-bold hover:bg-dark-600 transition shadow-lg uppercase tracking-widest"
            >
              Return to Lobby
            </button>
            <button
              onClick={handleFetchAnalysis}
              className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-widest transition shadow-lg shadow-primary/20 bg-primary/10 border ${theme.border} ${theme.color} hover:bg-primary hover:text-dark-900 group`}
            >
              <Lightbulb size={20} className="group-hover:animate-pulse" />
              Get AI Coaching Report
            </button>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            className="mt-8 pt-8 border-t border-dark-700"
          >
             <h3 className="text-lg uppercase tracking-widest font-bold text-primary mb-4 flex items-center gap-2">
              <Lightbulb size={22} className="text-cyan-400" /> AI Coach Details
            </h3>
            <div className="bg-dark-900/80 p-6 rounded-xl border border-dark-600 min-h-[150px]">
              {aiAnalysisLoading ? (
                 <div className="flex flex-col items-center justify-center h-full gap-4 text-cyan-400 py-8">
                   <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                   <p className="animate-pulse tracking-widest text-sm font-semibold uppercase">Analyzing match data...</p>
                 </div>
              ) : aiAnalysis ? (
                <>
                  <p className="text-gray-300 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium">
                    {aiAnalysis.analysis}
                  </p>
                  {aiAnalysis.weakTopics?.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-dark-700">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Suggested Topics to Practice:</p>
                      <div className="flex flex-wrap gap-2">
                        {aiAnalysis.weakTopics.map((t, i) => (
                          <span key={i} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider shadow-sm shadow-cyan-500/10">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <button
                onClick={() => navigate('/lobby')}
                className="w-full mt-6 bg-dark-700 text-white py-4 rounded-xl font-bold hover:bg-dark-600 transition tracking-widest uppercase border border-dark-500 shadow-md"
              >
                Return to Lobby
              </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default MatchResult;
