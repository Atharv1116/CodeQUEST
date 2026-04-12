import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, TrendingUp, TrendingDown, Minus, Clock, Target,
  Zap, Coins, ChevronRight, Star, BarChart2, MessageSquare, ArrowLeft
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── helpers ─────────────────────────────────────────────────────
const fmtTime = (sec) => {
  if (sec == null || sec <= 0) return '—';
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60)  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};

// ── component ──────────────────────────────────────────────────
const MatchResult = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const socket  = useSocket();
  const { user } = useAuth();

  const { matchResult: initialMatchResult, winner: winnerState, questionTitle } = location.state || {};

  const [matchResult, setMatchResult]         = useState(initialMatchResult || null);
  const [ratingPending, setRatingPending]     = useState(!initialMatchResult?.ratingChanges?.length);
  const [aiData, setAiData]                   = useState(null);   // { analysis, solved, attempts, solveTimeSec, weakTopics, topicTags }
  const [aiLoading, setAiLoading]             = useState(false);
  const [aiError, setAiError]                 = useState('');
  const [showAiPanel, setShowAiPanel]         = useState(false);
  const ratingTimeoutRef = useRef(null);

  // ── Wait for late-arriving rating-update ───────────────────
  useEffect(() => {
    if (!socket) return;

    const handleRatingUpdate = ({ matchId, ratingChanges }) => {
      console.log('[MatchResult] rating-update:', matchId, ratingChanges);
      clearTimeout(ratingTimeoutRef.current);
      setRatingPending(false);
      setMatchResult(prev => prev ? {
        ...prev,
        matchId: matchId || prev.matchId,
        ratingChanges: ratingChanges?.length > 0 ? ratingChanges : prev.ratingChanges
      } : prev);
    };

    socket.on('rating-update', handleRatingUpdate);

    // If rating hasn't arrived in 6 seconds, stop the skeleton
    ratingTimeoutRef.current = setTimeout(() => setRatingPending(false), 6000);

    return () => {
      socket.off('rating-update', handleRatingUpdate);
      clearTimeout(ratingTimeoutRef.current);
    };
  }, [socket]);

  // ── Redirect guard ─────────────────────────────────────────
  useEffect(() => {
    if (!matchResult && !winnerState) navigate('/lobby');
  }, [matchResult, winnerState, navigate]);

  if (!matchResult && !winnerState) return null;

  // ── Derived state ──────────────────────────────────────────
  const isWin  = winnerState === 'you';
  const isDraw = winnerState === 'draw';
  const isLoss = !isWin && !isDraw;

  const myUserId = user?.id?.toString() || user?._id?.toString();

  // Rating row — deterministic by userId first, then by delta polarity
  const myRatingRow = (() => {
    const changes = matchResult?.ratingChanges;
    if (!changes?.length) return null;
    if (myUserId) {
      const hit = changes.find(r => r.userId?.toString() === myUserId);
      if (hit) return hit;
    }
    // Fallback by win/loss polarity
    if (isWin)  return changes.find(r => (r.delta ?? 0) > 0) ?? changes[0];
    if (isLoss) return changes.find(r => (r.delta ?? 0) < 0) ?? changes[changes.length - 1];
    return changes[0];
  })();

  const delta    = myRatingRow ? (myRatingRow.delta ?? (myRatingRow.after - myRatingRow.before)) : null;
  const ratingBefore = myRatingRow?.before ?? myRatingRow?.oldRating ?? null;
  const ratingAfter  = myRatingRow?.after  ?? myRatingRow?.newRating ?? null;

  // XP / Coins — winner uses winner slot, loser uses loser slot
  const xpGained    = isWin ? matchResult?.xpChanges?.winner?.xp    : matchResult?.xpChanges?.loser?.xp;
  const coinsGained = isWin ? matchResult?.xpChanges?.winner?.coins  : matchResult?.xpChanges?.loser?.coins;

  // Solve stats — always use perPlayerStats[myUserId] first (most reliable)
  const myStats = (() => {
    if (myUserId && matchResult?.perPlayerStats?.[myUserId]) {
      return matchResult.perPlayerStats[myUserId];
    }
    if (isWin)  return matchResult?.stats?.winner ?? null;
    if (isLoss) return matchResult?.stats?.loser  ?? null;
    return matchResult?.stats?.winner ?? null;
  })();

  const solveMs  = myStats?.solveTimeMs ?? null;
  const solveSec = (solveMs != null && solveMs > 0) ? Math.round(solveMs / 1000) : null;
  const attempts = myStats?.attempts ?? (isWin ? 1 : '—');

  // ── Themes ────────────────────────────────────────────────
  const theme = isWin  ? { accent: '#00ffc3', label: 'text-primary', border: 'border-primary/40', glow: '0 0 60px rgba(0,255,195,0.15)' }
    : isDraw ? { accent: '#94a3b8', label: 'text-slate-400',  border: 'border-slate-500/40', glow: '0 0 60px rgba(148,163,184,0.08)' }
    :          { accent: '#f87171', label: 'text-red-400',    border: 'border-red-500/40',   glow: '0 0 60px rgba(248,113,113,0.12)' };

  // ── AI Analysis ───────────────────────────────────────────
  const handleOpenAi = async () => {
    // Redirect to AI Tutor with preloaded context
    const matchContext = {
      questionTitle: questionTitle || matchResult?.message || 'Recent Match',
      questionId: matchResult?.questionId,
      result: isWin ? 'win' : isDraw ? 'draw' : 'loss',
      solveTimeSec: solveSec,
      attempts: typeof attempts === 'number' ? attempts : null,
      ratingDelta: delta,
      matchId: matchResult?.matchId,
    };
    // If we have a matchId, fetch the AI analysis first and store in sessionStorage so AITutor can use it
    if (matchResult?.matchId) {
      setAiLoading(true);
      try {
        const token = localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const resp = await axios.get(`${API_URL}/api/match/${matchResult.matchId}/ai-analysis`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.data.ok) {
          // resp.data.analysis is an OBJECT {analysis, solved, attempts, solveTimeSec, weakTopics, topicTags}
          const analysisObj = resp.data.analysis;
          setAiData(analysisObj);
          setShowAiPanel(true);
          sessionStorage.setItem('cq_ai_match_context', JSON.stringify({
            ...matchContext,
            report: typeof analysisObj?.analysis === 'string' ? analysisObj.analysis : '',
            weakTopics: analysisObj?.weakTopics || [],
            topicTags: analysisObj?.topicTags || [],
          }));
        }
      } catch (e) {
        console.error('[MatchResult] AI fetch error:', e);
        setAiError('Could not load analysis. Opening AI Tutor directly.');
        setShowAiPanel(true);
        sessionStorage.setItem('cq_ai_match_context', JSON.stringify(matchContext));
      } finally {
        setAiLoading(false);
      }
    } else {
      // No matchId yet — open tutor with basic context
      sessionStorage.setItem('cq_ai_match_context', JSON.stringify(matchContext));
      setShowAiPanel(true);
    }
  };

  // ── Stat Card ──────────────────────────────────────────────
  const StatCard = ({ icon, label, value, color = 'text-white', delay = 0, accent }) => (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 120 }}
      className="relative bg-dark-800/70 backdrop-blur border border-dark-600/60 rounded-2xl p-5 text-center overflow-hidden group hover:-translate-y-1 transition-transform duration-300"
    >
      {accent && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `radial-gradient(circle at center, ${accent}10 0%, transparent 70%)` }} />}
      <div className="relative">
        <div className="flex justify-center mb-2">{icon}</div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{label}</p>
        <p className={`text-2xl font-black ${color}`}>{value}</p>
      </div>
    </motion.div>
  );

  // ── Rating Row ────────────────────────────────────────────
  const RatingRow = ({ r, isMe }) => {
    const d = r.delta ?? (r.after - r.before);
    const isPos = d >= 0;
    return (
      <div className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
        isMe
          ? 'bg-dark-700/80 border-primary/30 shadow-inner shadow-primary/5'
          : 'bg-dark-900/40 border-dark-700/40 hover:bg-dark-800/60'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black ${
            isPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {r.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className={`font-bold text-sm tracking-wide ${isMe ? 'text-primary' : 'text-gray-200'}`}>
              {r.username || 'Player'} {isMe && <span className="text-xs text-gray-500 font-normal">(you)</span>}
            </p>
            <p className="text-xs text-gray-500 font-mono">
              {r.before ?? r.oldRating ?? '?'} <span className="mx-1 text-gray-600">→</span> {r.after ?? r.newRating ?? '?'}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm ${
          isPos ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {isPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isPos ? '+' : ''}{d}
        </div>
      </div>
    );
  };

  // ── AI Panel ──────────────────────────────────────────────
  const AiPanel = () => {
    const report = typeof aiData?.analysis === 'string' ? aiData.analysis : '';
    const weak   = Array.isArray(aiData?.weakTopics) ? aiData.weakTopics : [];
    const tags   = Array.isArray(aiData?.topicTags)  ? aiData.topicTags  : [];
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="mt-6 rounded-2xl border border-cyan-500/20 bg-dark-900/60 overflow-hidden"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700 bg-dark-800/50">
          <p className="text-xs uppercase tracking-widest font-bold text-cyan-400 flex items-center gap-2">
            <BarChart2 size={14} /> AI Coaching Report
          </p>
          <button
            onClick={() => navigate('/ai-tutor', { state: { matchContext: JSON.parse(sessionStorage.getItem('cq_ai_match_context') || '{}') } })}
            className="flex items-center gap-1 text-xs text-primary hover:text-cyan-300 font-semibold transition"
          >
            Open AI Tutor <ChevronRight size={13} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {aiError && <p className="text-yellow-400 text-sm">{aiError}</p>}

          {/* Quick match stats from AI */}
          {aiData && (
            <div className="flex gap-3 flex-wrap text-xs">
              <span className={`px-3 py-1 rounded-full font-bold border ${aiData.solved ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                {aiData.solved ? '✅ Solved' : '❌ Not Solved'}
              </span>
              {aiData.attempts != null && (
                <span className="px-3 py-1 rounded-full font-bold bg-dark-700 text-gray-300 border border-dark-600">
                  {aiData.attempts} attempt{aiData.attempts !== 1 ? 's' : ''}
                </span>
              )}
              {aiData.solveTimeSec != null && (
                <span className="px-3 py-1 rounded-full font-bold bg-dark-700 text-gray-300 border border-dark-600">
                  ⏱ {aiData.solveTimeSec}s
                </span>
              )}
            </div>
          )}

          {/* Analysis text */}
          {report ? (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{report}</p>
          ) : !aiError ? (
            <p className="text-gray-500 text-sm italic">No detailed analysis available.</p>
          ) : null}

          {/* Weak topics */}
          {weak.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Topics to Practice</p>
              <div className="flex flex-wrap gap-2">
                {weak.map((t, i) => (
                  <span key={i} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs px-3 py-1 rounded-full font-semibold">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Topic tags */}
          {tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Problem Topics</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <span key={i} className="bg-dark-700 border border-dark-600 text-gray-400 text-xs px-3 py-1 rounded-full font-semibold">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA to full AI Tutor */}
          <button
            onClick={() => navigate('/ai-tutor', { state: { matchContext: JSON.parse(sessionStorage.getItem('cq_ai_match_context') || '{}') } })}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary hover:text-dark-900 transition group"
          >
            <MessageSquare size={16} className="group-hover:scale-110 transition-transform" />
            Continue with AI Tutor Chat
            <ChevronRight size={15} />
          </button>
        </div>
      </motion.div>
    );
  };

  // ── Main render ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/lobby')}
        className="fixed top-5 left-5 z-50 flex items-center gap-2 text-gray-400 hover:text-white bg-dark-800/80 backdrop-blur border border-dark-600 px-3 py-2 rounded-xl text-sm font-semibold transition hover:bg-dark-700"
      >
        <ArrowLeft size={16} /> Back
      </motion.button>

      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[130px] opacity-[0.07] pointer-events-none"
        style={{ background: theme.accent }}
      />

      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 100 }}
        className={`relative z-10 w-full max-w-2xl bg-dark-800/60 backdrop-blur-xl rounded-3xl border ${theme.border} p-6 md:p-10`}
        style={{ boxShadow: theme.glow }}
      >
        {/* ── Header ── */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
            className="mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: `${theme.accent}15`, border: `1.5px solid ${theme.accent}50`, boxShadow: `0 0 30px ${theme.accent}20` }}
          >
            {isWin ? <Trophy size={42} style={{ color: theme.accent }} />
              : isDraw ? <Minus size={42} style={{ color: theme.accent }} />
              : <span className="text-4xl font-black" style={{ color: theme.accent }}>✖</span>}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`text-5xl font-black uppercase tracking-widest ${theme.label} mb-2`}
          >
            {isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT'}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
            className="text-gray-400 text-base uppercase tracking-widest font-semibold"
          >
            {questionTitle || 'Match Completed'}
          </motion.p>
          {matchResult?.message && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
              className="text-gray-500 text-sm mt-1"
            >
              {matchResult.message}
            </motion.p>
          )}
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={<Clock size={24} className="text-cyan-400" />}
            label="Solve Time"
            value={fmtTime(solveSec)}
            delay={0.3}
            accent="#22d3ee"
          />
          <StatCard
            icon={<Target size={24} className="text-purple-400" />}
            label="Attempts"
            value={attempts}
            delay={0.36}
            accent="#a855f7"
          />
          <StatCard
            icon={<Zap size={24} className="text-blue-400" />}
            label="XP Gained"
            value={`+${xpGained ?? 0}`}
            color="text-blue-400"
            delay={0.42}
            accent="#60a5fa"
          />
          <StatCard
            icon={<Coins size={24} className="text-yellow-400" />}
            label="Coins"
            value={`+${coinsGained ?? 0}`}
            color="text-yellow-400"
            delay={0.48}
            accent="#facc15"
          />
        </div>

        {/* ── My Rating Highlight ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54 }}
          className="mb-5 p-4 rounded-2xl border border-dark-600/60 bg-dark-900/40 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg" style={{ background: `${theme.accent}15`, color: theme.accent }}>
              <Star size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Your Rating</p>
              {ratingPending && !myRatingRow ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-4 w-20 bg-dark-700 rounded animate-pulse" />
                  <span className="text-xs text-gray-600 italic">calculating…</span>
                </div>
              ) : (
                <p className="text-sm font-mono text-gray-300 mt-0.5">
                  {ratingBefore ?? '—'} <span className="text-gray-600 mx-1">→</span>{' '}
                  <span className="font-black" style={{ color: theme.accent }}>{ratingAfter ?? '—'}</span>
                </p>
              )}
            </div>
          </div>

          {ratingPending && !myRatingRow ? (
            <div className="h-7 w-16 bg-dark-700 rounded-full animate-pulse" />
          ) : delta != null ? (
            <div className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-black text-base ${
              delta >= 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {delta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {delta >= 0 ? '+' : ''}{delta}
            </div>
          ) : (
            <span className="text-xs text-gray-600 italic">unrated</span>
          )}
        </motion.div>

        {/* ── Full Player Ratings Table ── */}
        {matchResult?.ratingChanges?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="mb-5 rounded-2xl border border-dark-600/60 bg-dark-900/30 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
              <BarChart2 size={14} className="text-primary" />
              <p className="text-xs uppercase tracking-widest font-bold text-gray-400">Player Ratings</p>
            </div>
            <div className="p-3 space-y-2">
              {matchResult.ratingChanges.map((r, i) => (
                <RatingRow
                  key={i}
                  r={r}
                  isMe={myUserId && r.userId?.toString() === myUserId}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── AI Panel (expanded) ── */}
        <AnimatePresence>
          {showAiPanel && <AiPanel />}
        </AnimatePresence>

        {/* ── Action Buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66 }}
          className="flex flex-col sm:flex-row gap-3 mt-6"
        >
          <button
            onClick={() => navigate('/lobby')}
            className="flex-1 bg-dark-700/80 border border-dark-600 text-white py-3.5 rounded-xl font-bold hover:bg-dark-600 transition uppercase tracking-widest text-sm"
          >
            Return to Lobby
          </button>

          {!showAiPanel && (
            <button
              onClick={handleOpenAi}
              disabled={aiLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold uppercase tracking-widest text-sm transition relative overflow-hidden
                ${aiLoading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110 group'}
                bg-primary/10 border ${theme.border} ${theme.label}`}
            >
              {aiLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart2 size={17} className="group-hover:scale-110 transition-transform" />
                  Get AI Coaching Report
                </>
              )}
            </button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default MatchResult;
