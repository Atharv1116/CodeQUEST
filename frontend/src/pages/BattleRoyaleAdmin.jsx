import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Clock, Shield, Skull, Crown, ChevronRight, Award, Zap, Eye } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const BattleRoyaleAdmin = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────
  const [question, setQuestion] = useState(null);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timeLeft, setTimeLeft] = useState(300);
  const [leaderboard, setLeaderboard] = useState([]);
  const [eliminationSchedule, setEliminationSchedule] = useState([]);
  const [matchStatus, setMatchStatus] = useState('active'); // active | between-rounds | finished

  // Round results overlay
  const [showRoundResults, setShowRoundResults] = useState(false);
  const [roundResults, setRoundResults] = useState(null);

  // Final results
  const [finalResults, setFinalResults] = useState(null);

  // Reconnection flag
  const hasRecovered = useRef(false);

  // ── State recovery on mount ───────────────────────────
  useEffect(() => {
    if (!socket || !user || !roomId || hasRecovered.current) return;
    hasRecovered.current = true;

    socket.emit('join-room', roomId);

    // Try REST API recovery
    const recoverState = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/battle-royale/${roomId}/state`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.ok) {
          if (data.question) setQuestion(data.question);
          if (data.currentRound) setRound(data.currentRound);
          if (data.totalRounds) setTotalRounds(data.totalRounds);
          if (data.timerRemaining != null) setTimeLeft(data.timerRemaining);
          if (data.leaderboard) setLeaderboard(data.leaderboard);
          if (data.eliminationSchedule) setEliminationSchedule(data.eliminationSchedule);
          if (data.status) setMatchStatus(data.status);
          if (data.status === 'finished' && data.finalRankings) {
            setFinalResults({ finalRankings: data.finalRankings, winnerTeam: data.winnerTeam });
          }
        }
      } catch (err) {
        console.error('[BRAdmin] State recovery failed:', err);
      }
    };
    recoverState();
  }, [socket, user, roomId]);

  // ── Socket event handlers ─────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMatchStarted = (data) => {
      setQuestion(data.question);
      setRound(data.round || 1);
      setTotalRounds(data.totalRounds || 3);
      setTimeLeft(data.timerDuration || 300);
      setLeaderboard(data.leaderboard || []);
      setEliminationSchedule(data.eliminationSchedule || []);
      setMatchStatus('active');
      setShowRoundResults(false);
    };

    const onLeaderboardUpdate = (data) => {
      setLeaderboard(data.leaderboard || []);
    };

    const onRoundEnded = (data) => {
      setShowRoundResults(true);
      setRoundResults(data);
      setLeaderboard(data.leaderboard || []);
      setMatchStatus('between-rounds');
    };

    const onRoundStarted = (data) => {
      setShowRoundResults(false);
      setRoundResults(null);
      setQuestion(data.question);
      setRound(data.round);
      setTimeLeft(data.timerDuration || 300);
      setLeaderboard(data.leaderboard || []);
      setMatchStatus('active');
    };

    const onMatchFinished = (data) => {
      setMatchStatus('finished');
      setShowRoundResults(false);
      setFinalResults(data);
    };

    const onTimerTick = (data) => {
      if (data.roomId === roomId) {
        setTimeLeft(data.remaining);
      }
    };

    socket.on('br-match-started', onMatchStarted);
    socket.on('br-leaderboard-update', onLeaderboardUpdate);
    socket.on('br-round-ended', onRoundEnded);
    socket.on('br-round-started', onRoundStarted);
    socket.on('br-match-finished', onMatchFinished);
    socket.on('timer-tick', onTimerTick);

    return () => {
      socket.off('br-match-started', onMatchStarted);
      socket.off('br-leaderboard-update', onLeaderboardUpdate);
      socket.off('br-round-ended', onRoundEnded);
      socket.off('br-round-started', onRoundStarted);
      socket.off('br-match-finished', onMatchFinished);
      socket.off('timer-tick', onTimerTick);
    };
  }, [socket, roomId]);

  // ── Timer formatting ──────────────────────────────────
  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timerColor = timeLeft <= 30 ? 'text-red-400' : timeLeft <= 60 ? 'text-yellow-400' : 'text-cyan-400';

  // ── FINAL RESULTS SCREEN ──────────────────────────────
  if (matchStatus === 'finished' && finalResults) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-4xl w-full"
        >
          {/* Winner Banner */}
          <div className="text-center mb-8">
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Trophy className="mx-auto mb-4 text-yellow-400" size={80} />
            </motion.div>
            <h1 className="text-5xl font-bold text-white mb-2">
              Tournament Complete
            </h1>
            <p className="text-xl text-gray-300">
              Team {finalResults.winnerTeam} takes the crown!
            </p>
          </div>

          {/* Final Rankings */}
          <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Award className="text-yellow-400" /> Final Team Rankings
            </h2>
            <div className="space-y-3">
              {(finalResults.finalRankings || []).map((team, idx) => (
                <motion.div
                  key={team.teamNumber}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`p-4 rounded-xl flex items-center gap-4 ${
                    team.rank === 1
                      ? 'bg-gradient-to-r from-yellow-600/30 to-amber-600/30 border-2 border-yellow-500'
                      : team.rank === 2
                      ? 'bg-gradient-to-r from-gray-400/20 to-gray-300/20 border border-gray-400'
                      : team.rank === 3
                      ? 'bg-gradient-to-r from-orange-700/20 to-amber-700/20 border border-orange-600'
                      : 'bg-gray-800/50 border border-gray-700'
                  }`}
                >
                  {/* Rank Badge */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                    team.rank === 1 ? 'bg-yellow-500 text-black' :
                    team.rank === 2 ? 'bg-gray-400 text-black' :
                    team.rank === 3 ? 'bg-orange-600 text-white' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    #{team.rank}
                  </div>

                  {/* Team Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-lg">Team {team.teamNumber}</span>
                      {team.rank === 1 && <Crown className="w-5 h-5 text-yellow-400" />}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {(team.players || []).map(p => p.username).join(', ')}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right">
                    <div className="text-gray-300 text-sm">
                      Survived {team.roundsSurvived || 0} round{(team.roundsSurvived || 0) !== 1 ? 's' : ''}
                    </div>
                    <div className="text-gray-500 text-xs">
                      {team.status === 'eliminated' ? `Eliminated R${team.eliminatedInRound || '?'}` : '🏆 Champion'}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Return Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center mt-8"
          >
            <button
              onClick={() => navigate('/battle-royale-mode')}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all hover:scale-105"
            >
              Exit Spectator Mode
            </button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ── MAIN SPECTATOR UI ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Round Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-400" />
              <span className="text-white font-bold text-lg">Spectacting Round {round}</span>
              <span className="text-gray-400 text-sm">of {totalRounds}</span>
            </div>
            {/* Elimination info */}
            {eliminationSchedule.length > 0 && (
              <div className="hidden md:flex items-center gap-1 text-sm text-gray-400">
                {eliminationSchedule.map((s, i) => (
                  <span key={i} className={`${s.round === round ? 'text-cyan-400 font-bold' : ''}`}>
                    R{s.round}: Top {s.advanceCount}
                    {i < eliminationSchedule.length - 1 && <ChevronRight className="w-3 h-3 inline" />}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-2 ${timerColor} font-mono text-2xl font-bold`}>
            <Clock className="w-6 h-6" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          {/* Admin Badge */}
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="text-white font-semibold">Administrator</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Question View */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700 h-[calc(100vh-140px)] overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-300 mb-4 border-b border-gray-700 pb-2">
                Current Problem
              </h3>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white">
                  {question?.title || 'Loading question...'}
                </h2>
                {question?.difficulty && (
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    question.difficulty === 'easy' ? 'bg-green-600/30 text-green-400' :
                    question.difficulty === 'medium' ? 'bg-yellow-600/30 text-yellow-400' :
                    'bg-red-600/30 text-red-400'
                  }`}>
                    {question.difficulty.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                {question?.description || ''}
              </p>
              {question && (
                <div className="mt-4 space-y-3">
                  <div className="bg-gray-900/50 p-3 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1 font-semibold">Sample Input</div>
                    <pre className="text-cyan-400 text-sm">{question.sampleInput || '—'}</pre>
                  </div>
                  <div className="bg-gray-900/50 p-3 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1 font-semibold">Sample Output</div>
                    <pre className="text-cyan-400 text-sm">{question.sampleOutput || '—'}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Live Leaderboard */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-6 border border-gray-700 h-[calc(100vh-140px)] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Users className="w-7 h-7 text-cyan-400" />
                  Live Team Leaderboard
                </h3>
                <div className="text-sm text-gray-400">
                  {leaderboard.filter(t => !t.eliminated).length} Teams Alive
                </div>
              </div>

              <div className="space-y-3">
                {leaderboard
                  .filter(t => !t.eliminated)
                  .map((team, idx) => (
                    <motion.div
                      key={team.teamNumber}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 rounded-xl transition-all ${
                        team.rank === 1
                          ? 'bg-yellow-600/20 border-2 border-yellow-600/50'
                          : team.rank === 2
                          ? 'bg-gray-400/10 border-2 border-gray-500/30'
                          : team.rank === 3
                          ? 'bg-orange-600/10 border-2 border-orange-600/30'
                          : 'bg-gray-700/50 border border-gray-600/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            team.rank === 1 ? 'bg-yellow-500 text-black' :
                            team.rank === 2 ? 'bg-gray-400 text-black' :
                            team.rank === 3 ? 'bg-orange-600 text-white' :
                            'bg-gray-600 text-gray-300'
                          }`}>
                            {team.rank}
                          </span>
                          <div>
                            <span className="text-white font-bold text-lg">
                              Team {team.teamNumber}
                            </span>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {(team.players || []).map(p => p.username).join(', ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-cyan-400 font-bold text-lg">
                            {team.solvesCount}/{team.totalPlayers} solved
                          </span>
                          {team.totalTimeMs > 0 && (
                            <span className="text-gray-400 text-sm">
                              {(team.totalTimeMs / 1000).toFixed(1)}s total time
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Player solve timeline */}
                      {team.playerSolves && team.playerSolves.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-600/50 flex flex-wrap gap-2">
                          {team.playerSolves.map((ps, i) => (
                            <div key={i} className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded flex items-center gap-1.5">
                              <span className="text-green-400 font-semibold text-xs">✅ {ps.username}</span>
                              <span className="text-green-500/70 text-[10px]">{(ps.submissionTimeMs / 1000).toFixed(1)}s</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}

                {/* Eliminated teams */}
                {leaderboard.filter(t => t.eliminated).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-700">
                    <h4 className="text-sm text-red-400/80 mb-3 font-semibold flex items-center gap-2">
                      <Skull className="w-4 h-4" /> Eliminated Teams
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {leaderboard
                        .filter(t => t.eliminated)
                        .map(team => (
                          <div key={team.teamNumber} className="p-3 rounded-lg bg-red-900/10 border border-red-800/30 flex justify-between items-center">
                            <div>
                                <span className="text-red-400/80 text-sm font-medium block">
                                Team {team.teamNumber}
                                </span>
                                <span className="text-red-500/50 text-xs">
                                {(team.players || []).map(p => p.username).join(', ')}
                                </span>
                            </div>
                            <span className="text-red-500/70 text-xs font-semibold px-2 py-1 bg-red-900/40 rounded">
                              Out R{team.eliminatedInRound}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROUND RESULTS OVERLAY ──────────────────────── */}
      <AnimatePresence>
        {showRoundResults && roundResults && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-2xl w-full border border-gray-600 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <h2 className="text-3xl font-bold text-white mb-2 text-center">
                Round {roundResults.round} Results
              </h2>
              <p className="text-gray-400 text-center mb-6">
                {roundResults.isFinalRound
                  ? 'Final round complete — declaring winner...'
                  : `Top ${roundResults.advanced?.length || '?'} teams advance to Round ${roundResults.round + 1}`}
              </p>

              {/* Advanced Teams */}
              {roundResults.advanced && roundResults.advanced.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-green-400 font-semibold mb-2 flex items-center gap-1">
                    <Shield className="w-4 h-4" /> Advanced
                  </h3>
                  <div className="space-y-2">
                    {roundResults.advanced.map((team, idx) => (
                      <motion.div
                        key={team.teamNumber}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`p-3 rounded-lg flex items-center justify-between bg-green-900/20 border border-green-700/30`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">
                            #{team.rank} Team {team.teamNumber}
                          </span>
                        </div>
                        <span className="text-green-400 text-sm">
                          {team.solvesCount} solves • {(team.totalTimeMs / 1000).toFixed(1)}s
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Eliminated Teams */}
              {roundResults.eliminated && roundResults.eliminated.length > 0 && (
                <div>
                  <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-1">
                    <Skull className="w-4 h-4" /> Eliminated
                  </h3>
                  <div className="space-y-2">
                    {roundResults.eliminated.map((team, idx) => (
                      <motion.div
                        key={team.teamNumber}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 + 0.3 }}
                        className={`p-3 rounded-lg flex items-center justify-between bg-red-900/20 border border-red-700/30`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300 font-semibold">
                            #{team.rank} Team {team.teamNumber}
                          </span>
                        </div>
                        <span className="text-red-400 text-sm">
                          {team.solvesCount} solves • {(team.totalTimeMs / 1000).toFixed(1)}s
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {!roundResults.isFinalRound && (
                <p className="text-center text-gray-500 mt-6 text-sm animate-pulse">
                  Next round starting soon...
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BattleRoyaleAdmin;
