import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, TrendingUp, TrendingDown, Minus, Clock, Target,
  Zap, Coins, ChevronRight, BarChart2, MessageSquare
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── helpers ──────────────────────────────────────────────────────
const fmtTime = (sec) => {
  if (sec == null || sec <= 0) return '—';
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60)  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};

// ── component ────────────────────────────────────────────────────
const MatchResult = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const socket   = useSocket();
  const { user } = useAuth();

  const { matchResult: initialMatchResult, winner: winnerState, questionTitle } = location.state || {};

  const [matchResult, setMatchResult]   = useState(initialMatchResult || null);
  const [ratingPending, setRatingPending] = useState(!initialMatchResult?.ratingChanges?.length);
  // aiData holds flat fields: { analysis, solved, attempts, solveTimeSec, weakTopics, topicTags }
  const [aiData, setAiData]             = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState('');
  const [showAiPanel, setShowAiPanel]   = useState(false);
  const ratingTimeoutRef = useRef(null);

  // ── Wait for late-arriving rating-update ─────────────────────
  useEffect(() => {
    if (!socket) return;
    const handleRatingUpdate = ({ matchId, ratingChanges }) => {
      clearTimeout(ratingTimeoutRef.current);
      setRatingPending(false);
      setMatchResult(prev => prev ? {
        ...prev,
        matchId: matchId || prev.matchId,
        ratingChanges: ratingChanges?.length > 0 ? ratingChanges : prev.ratingChanges
      } : prev);
    };
    socket.on('rating-update', handleRatingUpdate);
    ratingTimeoutRef.current = setTimeout(() => setRatingPending(false), 6000);
    return () => {
      socket.off('rating-update', handleRatingUpdate);
      clearTimeout(ratingTimeoutRef.current);
    };
  }, [socket]);

  // ── Redirect guard ───────────────────────────────────────────
  useEffect(() => {
    if (!matchResult && !winnerState) navigate('/lobby');
  }, [matchResult, winnerState, navigate]);

  if (!matchResult && !winnerState) return null;

  // ── Derived state ────────────────────────────────────────────
  const isWin  = winnerState === 'you';
  const isDraw = winnerState === 'draw';
  const isLoss = !isWin && !isDraw;

  const myUserId = user?.id?.toString() || user?._id?.toString();

  // XP / Coins
  const xpGained    = isWin ? matchResult?.xpChanges?.winner?.xp    : matchResult?.xpChanges?.loser?.xp;
  const coinsGained = isWin ? matchResult?.xpChanges?.winner?.coins  : matchResult?.xpChanges?.loser?.coins;

  // My solve stats — perPlayerStats[myUserId] is most reliable
  const myStats = (() => {
    if (myUserId && matchResult?.perPlayerStats?.[myUserId]) return matchResult.perPlayerStats[myUserId];
    if (isWin)  return matchResult?.stats?.winner ?? null;
    if (isLoss) return matchResult?.stats?.loser  ?? null;
    return matchResult?.stats?.winner ?? null;
  })();

  const solveSec = (() => {
    const ms = myStats?.solveTimeMs ?? null;
    return (ms != null && ms > 0) ? Math.round(ms / 1000) : null;
  })();
  const attempts = myStats?.attempts ?? (isWin ? 1 : '—');

  // ── Theme ─────────────────────────────────────────────────────
  const theme = isWin  ? { accent: '#00ffc3', label: 'text-primary',    border: 'border-primary/40',  glow: '0 0 70px rgba(0,255,195,0.13)' }
    : isDraw ? { accent: '#94a3b8', label: 'text-slate-400',  border: 'border-slate-500/40', glow: '0 0 70px rgba(148,163,184,0.07)' }
    :          { accent: '#f87171', label: 'text-red-400',    border: 'border-red-500/40',   glow: '0 0 70px rgba(248,113,113,0.11)' };

  // ── AI coaching report ────────────────────────────────────────
  const handleOpenAi = async () => {
    const matchContext = {
      questionTitle: questionTitle || 'Recent Match',
      result: isWin ? 'win' : isDraw ? 'draw' : 'loss',
      solveTimeSec: solveSec,
      attempts: typeof attempts === 'number' ? attempts : null,
      matchId: matchResult?.matchId,
    };

    if (matchResult?.matchId) {
      setAiLoading(true);
      try {
        const token = localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        // Server now spreads the analysis object into the top-level response:
        // { ok, analysis (string), solved, attempts, solveTimeSec, weakTopics, topicTags }
        const resp = await axios.get(`${API_URL}/api/match/${matchResult.matchId}/ai-analysis`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.data.ok) {
          // Extract flat fields directly from resp.data
          const flat = {
            analysis:     typeof resp.data.analysis    === 'string' ? resp.data.analysis    : '',
            solved:       resp.data.solved,
            attempts:     resp.data.attempts,
            solveTimeSec: resp.data.solveTimeSec,
            weakTopics:   Array.isArray(resp.data.weakTopics) ? resp.data.weakTopics : [],
            topicTags:    Array.isArray(resp.data.topicTags)  ? resp.data.topicTags  : [],
          };
          setAiData(flat);
          setShowAiPanel(true);
          sessionStorage.setItem('cq_ai_match_context', JSON.stringify({
            ...matchContext,
            report:     flat.analysis,
            weakTopics: flat.weakTopics,
            topicTags:  flat.topicTags,
          }));
        }
      } catch (e) {
        console.error('[MatchResult] AI fetch error:', e);
        setAiError('Analysis unavailable. You can still chat with AI Tutor.');
        setShowAiPanel(true);
        sessionStorage.setItem('cq_ai_match_context', JSON.stringify(matchContext));
      } finally {
        setAiLoading(false);
      }
    } else {
      sessionStorage.setItem('cq_ai_match_context', JSON.stringify(matchContext));
      setShowAiPanel(true);
    }
  };

  const goToAiTutor = () =>
    navigate('/ai-tutor', {
      state: { matchContext: JSON.parse(sessionStorage.getItem('cq_ai_match_context') || '{}') }
    });

  // ── Sub-components ─────────────────────────────────────────────
  const StatCard = ({ icon, label, value, color = 'text-white', delay = 0, accent }) => (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 120 }}
      className="relative bg-dark-800/70 backdrop-blur border border-dark-600/60 rounded-2xl p-5 text-center overflow-hidden group hover:-translate-y-1 transition-transform duration-300"
    >
      {accent && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle at center, ${accent}12 0%, transparent 70%)` }} />}
      <div className="relative">
        <div className="flex justify-center mb-2">{icon}</div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{label}</p>
        <p className={`text-2xl font-black ${color}`}>{value}</p>
      </div>
    </motion.div>
  );

  // Rating row — same component for both winner and loser, for both self and opponent
  const RatingRow = ({ r, isMe }) => {
    const d    = r.delta ?? (r.after - r.before);
    const isPos = d >= 0;
    const rOld = r.before ?? r.oldRating ?? '?';
    const rNew = r.after  ?? r.newRating ?? '?';
    return (
      <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
        isMe
          ? 'bg-dark-700/70 border-primary/30 shadow-inner shadow-primary/5'
          : 'bg-dark-900/40 border-dark-700/40 hover:bg-dark-800/50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
            isPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {(r.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <p className={`font-bold text-sm ${isMe ? 'text-primary' : 'text-gray-200'}`}>
              {r.username || 'Player'}
              {isMe && <span className="ml-1.5 text-xs text-gray-500 font-normal">(you)</span>}
            </p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {rOld} <span className="mx-1 text-gray-600">→</span>
              <span className="font-semibold" style={{ color: isPos ? '#4ade80' : '#f87171' }}>{rNew}</span>
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-sm flex-shrink-0 ${
          isPos ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {isPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isPos ? '+' : ''}{d}
        </div>
      </div>
    );
  };

  const AiPanel = () => {
    const report = typeof aiData?.analysis === 'string' ? aiData.analysis : '';
    const weak   = Array.isArray(aiData?.weakTopics) ? aiData.weakTopics : [];
    const tags   = Array.isArray(aiData?.topicTags)  ? aiData.topicTags  : [];
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="mt-5 rounded-2xl border border-cyan-500/20 bg-dark-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700 bg-dark-800/50">
          <p className="text-xs uppercase tracking-widest font-bold text-cyan-400 flex items-center gap-2">
            <BarChart2 size={13} /> AI Coaching Report
          </p>
          <button onClick={goToAiTutor}
            className="flex items-center gap-1 text-xs text-primary hover:text-cyan-300 font-semibold transition">
            Open AI Tutor <ChevronRight size={13} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {aiError && <p className="text-yellow-400 text-sm">{aiError}</p>}
          {aiData && (
            <div className="flex gap-2 flex-wrap text-xs">
              <span className={`px-3 py-1 rounded-full font-bold border ${
                aiData.solved ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>{aiData.solved ? '✅ Solved' : '❌ Not Solved'}</span>
              {aiData.attempts != null &&
                <span className="px-3 py-1 rounded-full font-bold bg-dark-700 text-gray-300 border border-dark-600">
                  {aiData.attempts} attempt{aiData.attempts !== 1 ? 's' : ''}
                </span>}
              {aiData.solveTimeSec != null &&
                <span className="px-3 py-1 rounded-full font-bold bg-dark-700 text-gray-300 border border-dark-600">
                  ⏱ {aiData.solveTimeSec}s
                </span>}
            </div>
          )}
          {report
            ? <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{report}</p>
            : !aiError && <p className="text-gray-500 text-sm italic">No detailed analysis available.</p>}
          {weak.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Topics to Practice</p>
              <div className="flex flex-wrap gap-2">
                {weak.map((t, i) => (
                  <span key={i} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs px-3 py-1 rounded-full font-semibold">{t}</span>
                ))}
              </div>
            </div>
          )}
          {tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Problem Topics</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((t, i) => (
                  <span key={i} className="bg-dark-700 border border-dark-600 text-gray-400 text-xs px-3 py-1 rounded-full font-semibold">{t}</span>
                ))}
              </div>
            </div>
          )}
          <button onClick={goToAiTutor}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary hover:text-dark-900 transition group">
            <MessageSquare size={16} className="group-hover:scale-110 transition-transform" />
            Continue with AI Tutor Chat
            <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    );
  };

  // ── Main render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
      {/* Ambient glow — no back button (removed duplicate) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[130px] opacity-[0.07] pointer-events-none"
        style={{ background: theme.accent }} />

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
            initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
            className="mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: `${theme.accent}15`, border: `1.5px solid ${theme.accent}50`, boxShadow: `0 0 30px ${theme.accent}20` }}
          >
            {isWin ? <Trophy size={42} style={{ color: theme.accent }} />
              : isDraw ? <Minus size={42} style={{ color: theme.accent }} />
              : <span className="text-4xl font-black" style={{ color: theme.accent }}>✖</span>}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`text-5xl font-black uppercase tracking-widest ${theme.label} mb-2`}>
            {isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT'}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
            className="text-gray-400 text-base uppercase tracking-widest font-semibold">
            {questionTitle || 'Match Completed'}
          </motion.p>
          {matchResult?.message && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
              className="text-gray-500 text-sm mt-1">{matchResult.message}</motion.p>
          )}
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Clock size={24} className="text-cyan-400" />}    label="Solve Time" value={fmtTime(solveSec)} delay={0.30} accent="#22d3ee" />
          <StatCard icon={<Target size={24} className="text-purple-400" />}  label="Attempts"   value={attempts}         delay={0.36} accent="#a855f7" />
          <StatCard icon={<Zap size={24} className="text-blue-400" />}       label="XP Gained"  value={`+${xpGained ?? 0}`}   color="text-blue-400"   delay={0.42} accent="#60a5fa" />
          <StatCard icon={<Coins size={24} className="text-yellow-400" />}   label="Coins"      value={`+${coinsGained ?? 0}`} color="text-yellow-400" delay={0.48} accent="#facc15" />
        </div>

        {/* ── Player Ratings — always shown, both players, same component ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54 }}
          className="mb-5 rounded-2xl border border-dark-600/60 bg-dark-900/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
            <TrendingUp size={14} className="text-primary" />
            <p className="text-xs uppercase tracking-widest font-bold text-gray-400">Player Ratings</p>
          </div>
          <div className="p-3 space-y-2">
            {ratingPending && !matchResult?.ratingChanges?.length ? (
              /* Skeleton while waiting for rating-update event */
              [0, 1].map(i => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-dark-700/40 bg-dark-900/40 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-dark-700" />
                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-dark-700 rounded" />
                      <div className="h-2.5 w-32 bg-dark-700 rounded" />
                    </div>
                  </div>
                  <div className="h-7 w-14 bg-dark-700 rounded-full" />
                </div>
              ))
            ) : matchResult?.ratingChanges?.length > 0 ? (
              matchResult.ratingChanges.map((r, i) => (
                <RatingRow key={i} r={r} isMe={!!(myUserId && r.userId?.toString() === myUserId)} />
              ))
            ) : (
              <p className="text-gray-500 text-xs text-center py-3 italic">Rating data not yet available</p>
            )}
          </div>
        </motion.div>

        {/* ── AI Panel ── */}
        <AnimatePresence>{showAiPanel && <AiPanel />}</AnimatePresence>

        {/* ── Action Buttons ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}
          className="flex flex-col sm:flex-row gap-3 mt-6">
          <button onClick={() => navigate('/lobby')}
            className="flex-1 bg-dark-700/80 border border-dark-600 text-white py-3.5 rounded-xl font-bold hover:bg-dark-600 transition uppercase tracking-widest text-sm">
            Return to Lobby
          </button>
          {!showAiPanel && (
            <button onClick={handleOpenAi} disabled={aiLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold uppercase tracking-widest text-sm transition
                ${aiLoading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110 group'}
                bg-primary/10 border ${theme.border} ${theme.label}`}>
              {aiLoading
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Analyzing...</>
                : <><BarChart2 size={17} className="group-hover:scale-110 transition-transform" /> Get AI Coaching Report</>}
            </button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default MatchResult;
