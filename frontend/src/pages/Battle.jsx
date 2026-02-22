import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trophy, Lightbulb, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import axios from 'axios';

const LANGUAGE_CONFIG = {
  python: {
    label: 'Python 3',
    monaco: 'python',
    judgeId: 71,
    boilerplate: '# Write your code here\n',
  },
  cpp: {
    label: 'C++ ',
    monaco: 'cpp',
    judgeId: 54,
    boilerplate: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // Write your code here
    return 0;
}
`,
  },
  java: {
    label: 'Java ',
    monaco: 'java',
    judgeId: 62,
    boilerplate: `import java.io.*;
import java.util.*;

public class Solution {
    public static void main(String[] args) throws Exception {
        // Write your code here
    }
}
`,
  },
};

// Timer is now server-authoritative — timerDuration in match-found is used for display only
const DEFAULT_TIMER = 1800; // 30 min fallback

const buildDefaultCodeMap = () =>
  Object.entries(LANGUAGE_CONFIG).reduce((acc, [key, config]) => {
    acc[key] = config.boilerplate;
    return acc;
  }, {});

const getLanguageStorageKey = (roomId) => `codequest-language-${roomId || 'default'}`;

const formatTime = (totalSeconds) => {
  if (typeof totalSeconds !== 'number' || totalSeconds < 0) {
    return '00:00';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(totalSeconds % 60, 0);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const Battle = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [question, setQuestion] = useState(null);
  const [codeMap, setCodeMap] = useState(() => buildDefaultCodeMap());
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'python';
    const stored = window.sessionStorage?.getItem(getLanguageStorageKey(roomId));
    return LANGUAGE_CONFIG[stored] ? stored : 'python';
  });
  const [output, setOutput] = useState('');
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionIntent, setExecutionIntent] = useState(null);
  const [matchFinished, setMatchFinished] = useState(false);
  const [editorLocked, setEditorLocked] = useState(false);
  const [winner, setWinner] = useState(null);
  const [matchResult, setMatchResult] = useState(null); // { ratingChanges, stats, matchId, draw, reason }
  const [aiFeedback, setAiFeedback] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [activeTab, setActiveTab] = useState('output');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIMER);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  // 2v2 team state
  const [matchType, setMatchType] = useState('1v1');
  const [myTeam, setMyTeam] = useState(null); // 'blue' or 'red'
  const [teammates, setTeammates] = useState([]); // socket IDs of teammates
  const [opponents, setOpponents] = useState([]); // socket IDs of opponents (hidden)
  const [teammateNames, setTeammateNames] = useState([]); // usernames of teammates
  const chatEndRef = useRef(null);
  const timerHandleRef = useRef(null);
  const timerExpiredRef = useRef(false);
  const currentLanguageConfig = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.python;
  const currentCode = codeMap[language] ?? '';
  const hasRunnableCode = currentCode.trim().length > 0;

  useEffect(() => {
    if (!socket) return;

    console.log('[Battle] Emitting join-room for:', roomId);
    socket.emit('join-room', roomId);

    const handleMatchFound = (data) => {
      console.log('[Battle] Received match-found:', data);
      setTimeout(() => {
        if (data.question) setQuestion(data.question);
        // Use server-provided timerDuration if available
        if (data.timerDuration) setTimeLeft(data.timerDuration);
        if (data.type === '2v2') {
          setMatchType('2v2');
          setMyTeam(data.team || null);
          setTeammates(data.teammates || []);
          setOpponents(data.opponents || []);
        } else {
          setMatchType('1v1');
        }
      }, 0);
    };

    socket.on('match-found', handleMatchFound);

    // Server-authoritative timer tick
    socket.on('timer-tick', ({ remaining }) => {
      setTimeLeft(remaining);
    });

    // Editor freeze: someone submitted correctly, match is decided
    socket.on('match-locked', ({ winnerId }) => {
      setEditorLocked(true);
      if (winnerId && winnerId !== socket.id) {
        setOutput('🔒 Match locked — opponent submitted a correct solution.');
      }
    });

    socket.on('receive-message', ({ user, socketId, message }) => {
      const isMe = socketId === socket.id;
      const isTeammate = matchType === '2v2' && teammates.includes(socketId) && !isMe;

      // Track teammate names for 2v2 display
      if (isTeammate && !teammateNames.find(t => t.socketId === socketId)) {
        setTeammateNames(prev => [...prev, { socketId, username: user }]);
      }

      setChat(prev => [...prev, {
        user: isMe ? 'You' : user,
        message,
        type: 'user',
        isMe,
        isTeammate
      }]);
    });

    socket.on('score-update', ({ user, message }) => {
      setChat(prev => [...prev, { user, message, type: 'system' }]);
    });

    socket.on('evaluation-started', ({ message }) => {
      setOutput(message || 'Evaluating...');
    });

    socket.on('evaluation-result', ({ ok, correct, details, message, isRun }) => {
      setIsExecuting(false);
      setExecutionIntent(null);
      if (ok && correct) {
        const resultMessage = isRun
          ? `✅ Code runs correctly! (This was a test run - click Submit to finalize)\n${JSON.stringify(details, null, 2)}`
          : `✅ Correct!\n${JSON.stringify(details, null, 2)}`;
        setOutput(resultMessage);
      } else if (ok) {
        setOutput(`❌ Wrong Output\n${JSON.stringify(details, null, 2)}`);
      } else {
        setOutput(message || 'Evaluation failed. Please try again.');
      }
    });

    socket.on('ai-feedback', ({ feedback }) => {
      setAiFeedback(feedback);
    });

    socket.on('hint-received', ({ hint }) => {
      setAiFeedback(hint || 'No hint available at this time.');
    });

    socket.on('match-finished', (data) => {
      console.log('[Battle] Received match-finished:', data);
      setMatchFinished(true);
      setEditorLocked(true);
      setMatchResult(data);

      if (data.draw) {
        setShowDrawModal(true);
        return;
      }

      let didIWin = false;
      if (data.winner) {
        didIWin = data.winner === socket.id;
      } else if (data.winnerTeam) {
        didIWin = data.winnerTeam === myTeam;
      }

      setWinner(didIWin ? 'you' : 'opponent');
      if (didIWin) {
        setShowWonModal(true);
      } else {
        setShowLostModal(true);
      }

      if (data.message) {
        setChat(prev => [...prev, { user: 'System', message: data.message, type: 'system' }]);
      }
    });

    socket.on('player-disconnected', ({ socketId }) => {
      setChat(prev => [...prev, {
        user: 'System',
        message: 'Opponent disconnected',
        type: 'system'
      }]);
    });

    socket.on('opponent-left-match', () => {
      setMatchFinished(true);
      setWinner('you');
      setShowWonModal(true);
      setShowLostModal(false);
    });

    socket.on('you-left-match', () => {
      setShowLostModal(true);
    });

    socket.on('opponent-solved', ({ solver }) => {
      setChat(prev => [...prev, {
        user: 'System',
        message: 'Opponent solved the problem!',
        type: 'system'
      }]);
    });

    return () => {
      socket.off('match-found');
      socket.off('timer-tick');
      socket.off('match-locked');
      socket.off('receive-message');
      socket.off('score-update');
      socket.off('evaluation-started');
      socket.off('evaluation-result');
      socket.off('match-finished');
      socket.off('opponent-solved');
      socket.off('player-disconnected');
      socket.off('opponent-left-match');
      socket.off('you-left-match');
      socket.off('ai-feedback');
    };
  }, [socket, roomId, matchType, teammates, myTeam]);

  // Fallback: If question not received via socket within 3 seconds, fetch from API
  useEffect(() => {
    if (!roomId || question) return; // Already have question, no need to fetch

    const timeout = setTimeout(async () => {
      if (!question) {
        console.log('[Battle] Question not received via socket, fetching from API...');
        try {
          const token = localStorage.getItem('token');
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
          const response = await axios.get(`${API_URL}/api/match/${roomId}/question`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.data.ok && response.data.question) {
            console.log('[Battle] Question recovered from API:', response.data.question.title);
            setQuestion(response.data.question);
          }
        } catch (error) {
          console.error('[Battle] Failed to fetch question from API:', error);
        }
      }
    }, 3000); // Wait 3 seconds before fallback fetch

    return () => clearTimeout(timeout);
  }, [roomId, question]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    setCodeMap(buildDefaultCodeMap());
    if (typeof window === 'undefined') {
      setLanguage('python');
      return;
    }
    const stored = window.sessionStorage?.getItem(getLanguageStorageKey(roomId));
    setLanguage(LANGUAGE_CONFIG[stored] ? stored : 'python');
  }, [roomId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage?.setItem(getLanguageStorageKey(roomId), language);
  }, [language, roomId]);

  useEffect(() => {
    window.__codequestBattleGuard = { active: !matchFinished };
    return () => {
      window.__codequestBattleGuard = { active: false };
    };
  }, [matchFinished]);

  useEffect(() => {
    if (matchFinished && pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  }, [matchFinished, pendingNavigation, navigate]);

  const executeCode = (intent = 'run') => {
    if (!hasRunnableCode || isExecuting || !socket || editorLocked) return;
    setExecutionIntent(intent);
    setIsExecuting(true);
    setOutput(intent === 'run' ? 'Running your code...' : 'Submitting for evaluation...');

    socket.emit('submit-code', {
      roomId,
      code: currentCode,
      language_id: currentLanguageConfig.judgeId,
      inputOverride: question?.sampleInput,
      isSubmit: intent === 'submit'
    });
  };

  const handleLanguageSelect = (nextLang) => {
    if (!LANGUAGE_CONFIG[nextLang]) return;
    setCodeMap((prev) => {
      if (prev[nextLang] !== undefined) {
        return prev;
      }
      return {
        ...prev,
        [nextLang]: LANGUAGE_CONFIG[nextLang].boilerplate,
      };
    });
    setLanguage(nextLang);
  };

  const handleCodeChange = (value) => {
    const safeValue = value ?? '';
    setCodeMap((prev) => ({
      ...prev,
      [language]: safeValue,
    }));
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('send-message', { roomId, message });
    // Message will be added via receive-message event (broadcast to all including sender)
    setMessage('');
  };

  const requestHint = () => {
    socket.emit('request-hint', { roomId });
  };

  const handleTimerExpired = useCallback(() => {
    if (timerExpiredRef.current || matchFinished) return;
    timerExpiredRef.current = true;
    setShowLeaveConfirm(false);
    setPendingNavigation(null);
    setOutput('⏱️ Time is up! Auto-submitting your code...');

    // Auto-submit current code (always submit, even if empty)
    if (socket) {
      setIsExecuting(true);
      setExecutionIntent('auto-submit');
      // Always submit code, even if empty - server will handle it
      socket.emit('submit-code', {
        roomId,
        code: currentCode || '# No code submitted',
        language_id: currentLanguageConfig.judgeId,
        inputOverride: question?.sampleInput
      });
    }
  }, [matchFinished, roomId, socket, currentCode, currentLanguageConfig, question]);

  const handleLeaveMatch = useCallback((nextPath = null) => {
    if (!matchFinished) {
      setPendingNavigation(nextPath);
      setShowLeaveConfirm(true);
    } else {
      navigate(nextPath || '/lobby');
    }
  }, [matchFinished, navigate]);

  const confirmLeave = useCallback(() => {
    if (!socket || !roomId) return;
    setShowLeaveConfirm(false);
    socket.emit('leave-match', { roomId });
    // Show lost modal and navigate
    setShowLostModal(true);
    setMatchFinished(true);
  }, [socket, roomId]);

  const cancelLeave = useCallback(() => {
    setShowLeaveConfirm(false);
    setPendingNavigation(null);
  }, []);

  const handleLostOk = () => {
    setShowLostModal(false);
    const destination = pendingNavigation || '/lobby';
    setPendingNavigation(null);
    navigate(destination);
  };

  const handleWonOk = () => {
    setShowWonModal(false);
    setPendingNavigation(null);
    navigate('/lobby');
  };

  // Handle leave match request from navbar
  useEffect(() => {
    const handleLeaveRequest = (event) => {
      const nextPath = event?.detail?.nextPath || null;
      handleLeaveMatch(nextPath);
    };
    window.addEventListener('request-leave-match', handleLeaveRequest);
    return () => window.removeEventListener('request-leave-match', handleLeaveRequest);
  }, [handleLeaveMatch]);

  // Prevent navigation when in active match
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!matchFinished) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [matchFinished]);

  // --- CLIENT-SIDE TIMER REMOVED --- timer now driven by server timer-tick events ---
  // Fallback reconnection: if match-found wasn't received, poll state from server
  useEffect(() => {
    if (!roomId || question) return;
    const timeout = setTimeout(async () => {
      if (!question) {
        try {
          const token = localStorage.getItem('token');
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
          const resp = await axios.get(`${API_URL}/api/match/${roomId}/state`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (resp.data.ok) {
            if (resp.data.question) setQuestion(resp.data.question);
            if (resp.data.timerRemaining !== undefined) setTimeLeft(resp.data.timerRemaining);
            if (resp.data.editorLocked) setEditorLocked(true);
            if (resp.data.status === 'finished') setMatchFinished(true);
          }
        } catch (e) {
          console.error('[Battle] State recovery failed:', e);
        }
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [roomId, question]);

  // ---------- RENDER: Post-Match Screens ----------
  // Helper to render rating delta
  const RatingDelta = ({ userId, ratingChanges }) => {
    const me = ratingChanges?.find(r => r.userId === userId);
    if (!me) return null;
    const delta = me.newRating - me.oldRating;
    return (
      <span className={`flex items-center gap-1 font-bold text-lg ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {delta >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        {delta >= 0 ? '+' : ''}{delta} ({me.newRating})
      </span>
    );
  };

  if (matchFinished && !showWonModal && !showLostModal && !showDrawModal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass p-12 rounded-lg text-center max-w-2xl"
        >
          <Trophy className="text-primary mx-auto mb-4" size={80} />
          <h2 className="text-4xl font-bold mb-4 text-gradient">
            {winner === 'you' ? 'Victory!' : 'Defeat'}
          </h2>
          <button onClick={() => navigate('/lobby')}
            className="bg-primary text-dark-900 px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition">
            Return to Lobby
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-dark-900">
      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={(e) => {
            // Close modal when clicking outside
            if (e.target === e.currentTarget) {
              cancelLeave();
            }
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="glass p-8 rounded-lg max-w-md w-full mx-4"
          >
            <h3 className="text-2xl font-bold mb-4 text-gradient">Leave Match?</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to leave this match? You will lose the match.
            </p>
            <div className="flex space-x-4">
              <button
                onClick={confirmLeave}
                className="flex-1 bg-red-500 text-white py-2 rounded-lg font-semibold hover:bg-red-600 transition cursor-pointer"
                type="button"
              >
                Yes, Leave
              </button>
              <button
                onClick={cancelLeave}
                className="flex-1 bg-primary text-dark-900 py-2 rounded-lg font-semibold hover:bg-cyan-400 transition cursor-pointer"
                type="button"
              >
                No, Stay
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Draw Modal */}
      {showDrawModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="glass p-8 rounded-lg max-w-md w-full mx-4 text-center">
            <Minus className="text-gray-400 mx-auto mb-4" size={60} />
            <h3 className="text-3xl font-bold mb-2 text-gray-300">⏰ Draw</h3>
            <p className="text-gray-400 mb-4">{matchResult?.message || "Time's up! It's a draw."}</p>
            <button onClick={() => { setShowDrawModal(false); navigate('/lobby'); }}
              className="bg-primary text-dark-900 px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition">
              Return to Lobby
            </button>
          </motion.div>
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="glass p-8 rounded-lg max-w-md w-full mx-4 text-center">
            <h3 className="text-3xl font-bold mb-2 text-red-400">😔 You Lost</h3>
            <p className="text-gray-300 mb-4">
              {winner === 'opponent' ? 'Your opponent solved the problem first.' : 'You left the match.'}
            </p>
            {matchResult?.ratingChanges?.length > 0 && (
              <div className="mb-6 p-3 bg-dark-700/60 rounded-lg border border-dark-600">
                <p className="text-xs text-gray-400 mb-2">Rating Change</p>
                {matchResult.ratingChanges.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{r.username || 'You'}</span>
                    <span className={`font-bold ${(r.delta ?? (r.after - r.before)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(r.delta ?? (r.after - r.before)) >= 0 ? '+' : ''}{r.delta ?? (r.after - r.before)} → {r.after ?? r.newRating}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={handleLostOk}
              className="bg-primary text-dark-900 px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition">
              OK
            </button>
          </motion.div>
        </div>
      )}

      {/* Won Modal */}
      {showWonModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="glass p-8 rounded-lg max-w-md w-full mx-4 text-center">
            <Trophy className="text-primary mx-auto mb-4" size={60} />
            <h3 className="text-3xl font-bold mb-2 text-primary">🎉 You Won!</h3>
            {matchResult?.stats?.winner && (
              <div className="flex gap-4 justify-center text-sm mb-4">
                <span className="text-gray-400">⏱ {matchResult.stats.winner.solveTimeMs
                  ? `${Math.round(matchResult.stats.winner.solveTimeMs / 1000)}s` : 'N/A'}</span>
                <span className="text-gray-400">🔁 {matchResult.stats.winner.attempts} attempt(s)</span>
              </div>
            )}
            {matchResult?.ratingChanges?.length > 0 && (
              <div className="mb-6 p-3 bg-dark-700/60 rounded-lg border border-dark-600">
                <p className="text-xs text-gray-400 mb-2">Rating Change</p>
                {matchResult.ratingChanges.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{r.username || 'You'}</span>
                    <span className={`font-bold ${(r.delta ?? (r.after - r.before)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(r.delta ?? (r.after - r.before)) >= 0 ? '+' : ''}{r.delta ?? (r.after - r.before)} → {r.after ?? r.newRating}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={handleWonOk}
              className="bg-primary text-dark-900 px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition">
              OK
            </button>
          </motion.div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden border-t border-dark-700">
        {/* Left Panel - Question Section (LeetCode style) */}
        <div className="w-1/2 border-r border-dark-700 flex flex-col overflow-hidden bg-dark-800">
          {/* Question Header */}
          <div className="bg-dark-900 border-b border-dark-700 flex items-center justify-between px-4 py-2 flex-shrink-0">
            <span className="text-sm text-gray-300 font-medium">Problem Description</span>
            {/* 2v2 Team Display */}
            {matchType === '2v2' && myTeam && (
              <div className="flex items-center gap-4 text-xs">
                <div className={`px-2 py-1 rounded ${myTeam === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                  Team {myTeam === 'blue' ? 'Blue' : 'Red'}
                </div>
                <div className="text-gray-400">
                  {teammateNames.length > 0 ? (
                    teammateNames.map(t => t.username).join(', ')
                  ) : (
                    'Waiting for teammate...'
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Question Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 bg-dark-800">
            {/* 2v2 Team Matchup Display */}
            {matchType === '2v2' && myTeam && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-dark-700/50 border border-dark-600 rounded-lg"
              >
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div className="flex flex-col items-center">
                    <div className={`px-3 py-1 rounded font-semibold ${myTeam === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                      Team {myTeam === 'blue' ? 'Blue' : 'Red'}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-300">
                      <div className="text-primary">You</div>
                      {teammateNames.map((t, idx) => (
                        <div key={idx}>{t.username}</div>
                      ))}
                    </div>
                  </div>
                  <div className="text-gray-500 font-bold">VS</div>
                  <div className="flex flex-col items-center">
                    <div className={`px-3 py-1 rounded font-semibold ${myTeam === 'blue' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      Team {myTeam === 'blue' ? 'Red' : 'Blue'}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      <div>Hidden</div>
                      <div>Hidden</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-dark-700 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-100">
                  {question?.title || 'Loading Problem...'}
                </h2>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${question?.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                  question?.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                  {question?.difficulty?.toUpperCase() || 'EASY'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-primary text-sm font-semibold">
                <Clock size={16} />
                <span aria-live="polite">{timeLeft !== null ? formatTime(timeLeft) : '--:--'}</span>
              </div>
            </div>

            <div className="text-gray-300 mb-4 leading-relaxed">
              <p className="mb-3 whitespace-pre-wrap text-sm">{question?.description || ''}</p>
            </div>

            {question && (
              <>
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-gray-200 mb-2">Examples:</h3>
                  <div className="bg-dark-700/50 border border-dark-600 rounded p-3 mb-2">
                    <p className="text-xs text-gray-400 mb-2 font-medium">Example 1:</p>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex items-start">
                        <span className="text-gray-500 mr-2 min-w-[45px]">Input:</span>
                        <code className="text-primary break-all">s = "{question.sampleInput}"</code>
                      </div>
                      <div className="flex items-start">
                        <span className="text-gray-500 mr-2 min-w-[45px]">Output:</span>
                        <code className="text-primary break-all">"{question.sampleOutput}"</code>
                      </div>
                    </div>
                  </div>
                </div>

                {question.inputFormat && (
                  <div className="mb-3 pb-3 border-b border-dark-700">
                    <h4 className="text-xs font-semibold text-gray-300 mb-1.5">Input Format:</h4>
                    <p className="text-xs text-gray-400 font-mono bg-dark-700/30 p-2 rounded border border-dark-600">{question.inputFormat}</p>
                  </div>
                )}

                {question.outputFormat && (
                  <div className="mb-3 pb-3 border-b border-dark-700">
                    <h4 className="text-xs font-semibold text-gray-300 mb-1.5">Output Format:</h4>
                    <p className="text-xs text-gray-400 font-mono bg-dark-700/30 p-2 rounded border border-dark-600">{question.outputFormat}</p>
                  </div>
                )}
              </>
            )}

            {/* AI Feedback */}
            {aiFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 bg-primary/10 border-l-4 border-primary p-3 rounded-lg border border-primary/20"
              >
                <h4 className="font-semibold text-primary mb-1.5 flex items-center text-xs">
                  <Lightbulb size={14} className="mr-1.5" />
                  AI Tutor Feedback
                </h4>
                <p className="text-gray-300 text-xs leading-relaxed">{aiFeedback}</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Panel - Code Editor, Output, Chat (LeetCode style) */}
        <div className="w-1/2 flex flex-col overflow-hidden bg-dark-800">
          {/* Code Editor Section */}
          <div className="flex-1 flex flex-col min-h-0 border-b-2 border-dark-600">
            <div className="bg-dark-900 border-b border-dark-700 flex items-center justify-between px-4 py-2 flex-shrink-0 gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="uppercase tracking-wide text-xs text-gray-500">Language</span>
                <select
                  value={language}
                  onChange={(e) => handleLanguageSelect(e.target.value)}
                  className="bg-dark-800 border border-dark-600 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 text-sm"
                >
                  {Object.entries(LANGUAGE_CONFIG).map(([langKey, config]) => (
                    <option key={langKey} value={langKey}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={requestHint}
                  disabled={editorLocked}
                  className="flex items-center space-x-1.5 text-primary hover:text-cyan-400 transition text-sm px-3 py-1 rounded hover:bg-primary/10 disabled:opacity-40">
                  <Lightbulb size={16} />
                  <span>Get Hint</span>
                </button>
                <button
                  onClick={() => executeCode('run')}
                  disabled={isExecuting || !hasRunnableCode || editorLocked}
                  className="bg-primary text-dark-900 px-4 py-1.5 rounded-md text-xs font-semibold tracking-widest hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20">
                  {executionIntent === 'run' && isExecuting ? 'RUNNING' : 'RUN'}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-dark-900">
              <Editor
                height="100%"
                language={currentLanguageConfig.monaco}
                defaultLanguage={currentLanguageConfig.monaco}
                value={currentCode}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  wordWrap: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 10, bottom: 10 }
                }}
              />
            </div>
          </div>

          {/* Bottom Section - Output and Chat Tabs (Fixed height, always visible) */}
          <div className="h-56 flex flex-col border-t-2 border-dark-600 bg-dark-800 flex-shrink-0">
            {/* Tabs Header */}
            <div className="bg-dark-900 border-b border-dark-700 flex flex-shrink-0">
              <button
                onClick={() => setActiveTab('output')}
                className={`px-4 py-2 text-sm font-medium transition relative ${activeTab === 'output'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                Output
                {activeTab === 'output' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-4 py-2 text-sm font-medium transition relative ${activeTab === 'chat'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-gray-300'
                  }`}
              >
                Chat
                {activeTab === 'chat' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Output Panel */}
              {activeTab === 'output' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-3 bg-dark-800 min-h-0">
                    <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {output || 'Run results will appear here...'}
                    </pre>
                  </div>
                  {/* Submit Button - Always visible at bottom */}
                  <div className="bg-dark-900 border-t border-dark-700 px-4 py-2.5 flex justify-end space-x-2 flex-shrink-0">
                    <button
                      onClick={() => executeCode('submit')}
                      disabled={isExecuting || !hasRunnableCode || editorLocked}
                      className="bg-primary text-dark-900 px-6 py-2 rounded-md text-sm font-semibold hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                    >
                      {executionIntent === 'submit' && isExecuting ? 'Submitting...' : editorLocked ? 'Locked 🔒' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Panel */}
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0 bg-dark-800">
                    {chat.length === 0 ? (
                      <div className="text-center text-gray-500 text-xs py-6">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      chat.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded text-xs ${msg.type === 'system'
                            ? 'bg-dark-700/50 text-gray-400 italic border border-dark-600'
                            : msg.isMe
                              ? 'bg-primary/15 border border-primary/30'
                              : 'bg-dark-700/30 border border-dark-600'
                            }`}
                        >
                          <span className={`font-semibold ${msg.isMe ? 'text-primary' : 'text-cyan-400'}`}>
                            {msg.user}:
                          </span>{' '}
                          <span className={msg.isMe ? 'text-gray-200' : 'text-gray-300'}>{msg.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {/* Chat Input - Always visible at bottom */}
                  <div className="bg-dark-900 border-t border-dark-700 px-4 py-2.5 flex space-x-2 flex-shrink-0">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 bg-dark-700 border border-dark-600 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!message.trim()}
                      className="bg-primary text-dark-900 px-4 py-2 rounded-md hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Battle;
