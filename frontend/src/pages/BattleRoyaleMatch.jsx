import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Clock, Send, Play, Shield, Skull, Crown, ChevronRight, Award, Zap } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const BattleRoyaleMatch = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────
  const [question, setQuestion] = useState(null);
  const [code, setCode] = useState('# Write your code here\n');
  const [languageId, setLanguageId] = useState(71); // Python
  const [output, setOutput] = useState('');
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timeLeft, setTimeLeft] = useState(300);
  const [leaderboard, setLeaderboard] = useState([]);
  const [teams, setTeams] = useState([]);
  const [eliminationSchedule, setEliminationSchedule] = useState([]);
  const [evaluating, setEvaluating] = useState(false);
  const [editorLocked, setEditorLocked] = useState(false);
  const [matchStatus, setMatchStatus] = useState('active'); // active | between-rounds | finished
  const [mySolved, setMySolved] = useState(false);

  // Round results overlay
  const [showRoundResults, setShowRoundResults] = useState(false);
  const [roundResults, setRoundResults] = useState(null);

  // Final results
  const [finalResults, setFinalResults] = useState(null);

  // Reconnection flag
  const hasRecovered = useRef(false);

  // ── Find my team ──────────────────────────────────────
  const myTeam = React.useMemo(() => {
    if (!user || !teams || teams.length === 0) return null;
    for (const team of teams) {
      if (team.players?.some(p => p.userId === user.id)) {
        return team.teamNumber;
      }
    }
    return null;
  }, [user, teams]);

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
          if (data.teams) setTeams(data.teams);
          if (data.leaderboard) setLeaderboard(data.leaderboard);
          if (data.eliminationSchedule) setEliminationSchedule(data.eliminationSchedule);
          if (data.status) setMatchStatus(data.status);
          if (data.status === 'finished' && data.finalRankings) {
            setFinalResults({ finalRankings: data.finalRankings, winnerTeam: data.winnerTeam });
          }
        }
      } catch (err) {
        console.error('[BRMatch] State recovery failed:', err);
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
      setTeams(data.teams || []);
      setLeaderboard(data.leaderboard || []);
      setEliminationSchedule(data.eliminationSchedule || []);
      setMatchStatus('active');
      setMySolved(false);
      setEditorLocked(false);
      setShowRoundResults(false);
    };

    const onLeaderboardUpdate = (data) => {
      setLeaderboard(data.leaderboard || []);
    };

    const onRoundEnded = (data) => {
      setShowRoundResults(true);
      setEditorLocked(true);
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
      setEditorLocked(false);
      setMySolved(false);
      setOutput('');
      setCode('# Write your code here\n');
    };

    const onMatchFinished = (data) => {
      setMatchStatus('finished');
      setEditorLocked(true);
      setShowRoundResults(false);
      setFinalResults(data);
    };

    const onTimerTick = (data) => {
      if (data.roomId === roomId) {
        setTimeLeft(data.remaining);
      }
    };

    const onEvaluationStarted = () => {
      setEvaluating(true);
    };

    const onEvaluationResult = (data) => {
      setEvaluating(false);
      if (!data.ok) {
        setOutput(`❌ Error: ${data.message}`);
        return;
      }
      const d = data.details || {};
      if (data.isRun) {
        setOutput(
          d.correct
            ? `✅ Sample test passed!\n\nOutput:\n${d.stdout || '(empty)'}`
            : `❌ Wrong output\n\nExpected: (see problem)\nGot: ${d.stdout || '(empty)'}${d.stderr ? `\n\nStderr:\n${d.stderr}` : ''}${d.compile_output ? `\n\nCompiler:\n${d.compile_output}` : ''}`
        );
      } else {
        if (data.correct) {
          setOutput(`✅ Correct! Your solution has been accepted.\nTime: ${d.time || '—'}s | Memory: ${d.memory || '—'}KB`);
          setMySolved(true);
        } else {
          setOutput(
            `❌ Wrong Answer (Attempt ${data.attempt || '?'})\n\nStatus: ${d.status || 'Wrong Answer'}${d.stderr ? `\nStderr: ${d.stderr}` : ''}${d.compile_output ? `\nCompiler: ${d.compile_output}` : ''}`
          );
        }
      }
    };

    const onMatchLocked = () => {
      setEditorLocked(true);
    };

    socket.on('br-match-started', onMatchStarted);
    socket.on('br-leaderboard-update', onLeaderboardUpdate);
    socket.on('br-round-ended', onRoundEnded);
    socket.on('br-round-started', onRoundStarted);
    socket.on('br-match-finished', onMatchFinished);
    socket.on('timer-tick', onTimerTick);
    socket.on('evaluation-started', onEvaluationStarted);
    socket.on('evaluation-result', onEvaluationResult);
    socket.on('match-locked', onMatchLocked);

    return () => {
      socket.off('br-match-started', onMatchStarted);
      socket.off('br-leaderboard-update', onLeaderboardUpdate);
      socket.off('br-round-ended', onRoundEnded);
      socket.off('br-round-started', onRoundStarted);
      socket.off('br-match-finished', onMatchFinished);
      socket.off('timer-tick', onTimerTick);
      socket.off('evaluation-started', onEvaluationStarted);
      socket.off('evaluation-result', onEvaluationResult);
      socket.off('match-locked', onMatchLocked);
    };
  }, [socket, roomId]);

  // ── Actions ───────────────────────────────────────────
  const runCode = () => {
    if (!code.trim() || evaluating || editorLocked) return;
    setEvaluating(true);
    setOutput('Running on sample tests...');
    socket.emit('submit-code', {
      roomId, code, language_id: languageId,
      isSubmit: false
    });
  };

  const submitCode = () => {
    if (!code.trim() || evaluating || editorLocked || mySolved) return;
    setEvaluating(true);
    setOutput('Submitting for evaluation...');
    socket.emit('submit-code', {
      roomId, code, language_id: languageId,
      isSubmit: true
    });
  };

  // ── Timer formatting ──────────────────────────────────
  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timerColor = timeLeft <= 30 ? 'text-red-400' : timeLeft <= 60 ? 'text-yellow-400' : 'text-cyan-400';

  // ── FINAL RESULTS SCREEN ──────────────────────────────
  if (matchStatus === 'finished' && finalResults) {
    const isWinner = finalResults.winnerTeam === myTeam;
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
              <Trophy className={`mx-auto mb-4 ${isWinner ? 'text-yellow-400' : 'text-gray-400'}`} size={80} />
            </motion.div>
            <h1 className="text-5xl font-bold text-white mb-2">
              {isWinner ? '🏆 Your Team Won!' : 'Battle Royale Complete'}
            </h1>
            <p className="text-xl text-gray-300">
              {isWinner
                ? 'Congratulations! Your team dominated the competition!'
                : `Team ${finalResults.winnerTeam} takes the crown!`}
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
                      : team.teamNumber === myTeam
                      ? 'bg-purple-600/20 border border-purple-500'
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
                      {team.teamNumber === myTeam && (
                        <span className="px-2 py-0.5 bg-purple-600 rounded text-xs text-white font-semibold">YOU</span>
                      )}
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
              Return to Lobby
            </button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ── Compute Player Leaderboard ────────────────────────
  const playerLeaderboard = leaderboard
    .filter(t => !t.eliminated)
    .flatMap(t => t.playerSolves || [])
    .sort((a, b) => a.submissionTimeMs - b.submissionTimeMs)
    .map((p, index) => ({ ...p, rank: index + 1 }));

  // ── MAIN MATCH UI ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/30 to-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Round Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <span className="text-white font-bold text-lg">Round {round}</span>
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

          {/* My Team Badge */}
          {myTeam && (
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${mySolved ? 'bg-green-900/40 border-green-500/50' : 'bg-purple-900/40 border-purple-500/50'}`}>
              <Shield className={`w-5 h-5 ${mySolved ? 'text-green-400' : 'text-purple-400'}`} />
              <span className="text-white font-bold text-lg tracking-wide">Team {myTeam} <span className="text-sm font-normal text-gray-300 ml-1">(You)</span></span>
              {mySolved && <span className="text-green-400 font-semibold ml-2">✅ Solved</span>}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Left: Question + Editor (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Question Panel */}
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
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
                <div className="mt-4 grid md:grid-cols-2 gap-3">
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

            {/* Language Selector + Editor */}
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <select
                    value={languageId}
                    onChange={(e) => setLanguageId(Number(e.target.value))}
                    disabled={editorLocked}
                    className="bg-gray-700 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:border-cyan-500 outline-none"
                  >
                    <option value={71}>Python 3</option>
                    <option value={62}>Java</option>
                    <option value={54}>C++</option>
                    <option value={63}>JavaScript</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runCode}
                    disabled={evaluating || editorLocked}
                    className="px-4 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm font-medium transition disabled:opacity-40 flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" /> Run
                  </button>
                  <button
                    onClick={submitCode}
                    disabled={evaluating || editorLocked || mySolved}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition flex items-center gap-1 ${
                      mySolved
                        ? 'bg-green-700 text-green-200 cursor-not-allowed'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white disabled:opacity-40'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" /> {mySolved ? 'Solved ✅' : 'Submit'}
                  </button>
                </div>
              </div>
              <Editor
                height="350px"
                defaultLanguage="python"
                language={languageId === 71 ? 'python' : languageId === 62 ? 'java' : languageId === 54 ? 'cpp' : 'javascript'}
                value={code}
                onChange={(value) => setCode(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  readOnly: editorLocked,
                  scrollBeyondLastLine: false
                }}
              />
            </div>

            {/* Output */}
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Output</h3>
              <pre className="bg-gray-900/50 p-3 rounded-lg text-sm text-gray-300 min-h-[60px] whitespace-pre-wrap overflow-x-auto">
                {output || 'Run or submit your code to see results...'}
              </pre>
            </div>
          </div>

          {/* Right: Leaderboards (2 cols) */}
          <div className="lg:col-span-2 grid md:grid-cols-2 gap-4 items-start">
            {/* Team Leaderboard */}
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-4 border border-gray-700 sticky top-4">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Team Leaderboard
              </h3>
              <div className="space-y-2">
                {leaderboard
                  .filter(t => !t.eliminated)
                  .map((team, idx) => (
                    <motion.div
                      key={team.teamNumber}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-3 rounded-lg transition-all ${
                        team.teamNumber === myTeam
                          ? 'bg-purple-600/30 border-2 border-purple-500'
                          : team.rank === 1
                          ? 'bg-yellow-600/20 border border-yellow-600/50'
                          : 'bg-gray-700/50 border border-gray-600/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            team.rank === 1 ? 'bg-yellow-500 text-black' :
                            team.rank === 2 ? 'bg-gray-400 text-black' :
                            team.rank === 3 ? 'bg-orange-600 text-white' :
                            'bg-gray-600 text-gray-300'
                          }`}>
                            {team.rank}
                          </span>
                          <span className="text-white font-semibold text-sm">
                            Team {team.teamNumber}
                            {team.teamNumber === myTeam && ' ⭐'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-cyan-400 font-mono">
                          {team.solvesCount}/{team.totalPlayers} solved
                        </span>
                        {team.totalTimeMs > 0 && (
                          <span className="text-gray-400">
                            {(team.totalTimeMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {/* Player solve indicators */}
                      {team.playerSolves && team.playerSolves.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {team.playerSolves.map((ps, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-green-600/30 rounded text-[10px] text-green-400">
                              ✅ {(ps.submissionTimeMs / 1000).toFixed(0)}s
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}

                {/* Eliminated teams */}
                {leaderboard.filter(t => t.eliminated).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1">
                      <Skull className="w-3 h-3" /> Eliminated
                    </p>
                    {leaderboard
                      .filter(t => t.eliminated)
                      .map(team => (
                        <div key={team.teamNumber} className="p-2 rounded-lg bg-red-900/20 border border-red-800/30 mb-1">
                          <div className="flex items-center justify-between">
                            <span className="text-red-400/70 text-xs font-medium">
                              Team {team.teamNumber}
                              {team.teamNumber === myTeam && ' (You)'}
                            </span>
                            <span className="text-red-500/50 text-[10px]">
                              R{team.eliminatedInRound}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Player Leaderboard */}
            <div className="bg-gray-800/60 backdrop-blur-sm rounded-xl p-4 border border-gray-700 sticky top-4">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-400" />
                Player Leaderboard
              </h3>
              <div className="space-y-2">
                {playerLeaderboard.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No submissions yet...</p>
                ) : (
                  playerLeaderboard.map(player => (
                    <motion.div
                      key={player.userId}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-2.5 rounded-lg flex items-center gap-3 transition-all ${
                        player.userId === user?.id
                          ? 'bg-purple-600/30 border border-purple-500'
                          : player.rank === 1
                          ? 'bg-yellow-600/20 border border-yellow-600/50'
                          : 'bg-gray-700/50 border border-gray-600/30'
                      }`}
                    >
                      <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        player.rank === 1 ? 'bg-yellow-500 text-black' :
                        player.rank === 2 ? 'bg-gray-400 text-black' :
                        player.rank === 3 ? 'bg-orange-600 text-white' :
                        'bg-gray-600 text-gray-300'
                      }`}>
                        {player.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm truncate">
                            {player.username}
                          </span>
                          {player.userId === user?.id && <span className="text-xs">⭐</span>}
                        </div>
                        <div className="text-xs flex items-center gap-1 text-gray-400 mt-0.5">
                          <span className="px-1.5 py-0.5 bg-gray-800 rounded font-medium text-[10px] border border-gray-600">
                            Team {player.teamNumber}
                          </span>
                          <span className="text-cyan-400 font-mono ml-auto">
                            {(player.submissionTimeMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))
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
                        className={`p-3 rounded-lg flex items-center justify-between ${
                          team.teamNumber === myTeam
                            ? 'bg-green-600/30 border border-green-500'
                            : 'bg-green-900/20 border border-green-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">
                            #{team.rank} Team {team.teamNumber}
                          </span>
                          {team.teamNumber === myTeam && (
                            <span className="px-2 py-0.5 bg-green-600 rounded text-xs text-white">YOU</span>
                          )}
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
                        className={`p-3 rounded-lg flex items-center justify-between ${
                          team.teamNumber === myTeam
                            ? 'bg-red-600/30 border border-red-500'
                            : 'bg-red-900/20 border border-red-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300 font-semibold">
                            #{team.rank} Team {team.teamNumber}
                          </span>
                          {team.teamNumber === myTeam && (
                            <span className="px-2 py-0.5 bg-red-600 rounded text-xs text-white">YOU</span>
                          )}
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

export default BattleRoyaleMatch;
