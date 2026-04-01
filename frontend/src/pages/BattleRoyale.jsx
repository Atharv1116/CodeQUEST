import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Clock, Send, Skull } from 'lucide-react';

const BattleRoyale = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [question, setQuestion] = useState(null);
  const [code, setCode] = useState('# Write your code here\n');
  const [output, setOutput] = useState('');
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(300);
  const [leaderboard, setLeaderboard] = useState([]);
  const [eliminated, setEliminated] = useState([]);
  const [evaluating, setEvaluating] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [winner, setWinner] = useState(null);
  const [rankings, setRankings] = useState([]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join-room', roomId);

    socket.on('match-found', (data) => {
      setQuestion(data.question);
      setRound(data.round);
      setLeaderboard(data.players.map(p => ({ socketId: p, solved: false, time: null })));
    });

    socket.on('battle-royale-round-start', (data) => {
      setQuestion(data.question);
      setRound(data.round);
      setTimeLeft(data.timeLimit);
      setEliminated([]);
    });

    socket.on('battle-royale-solve', ({ solver, time }) => {
      setLeaderboard(prev => prev.map(p => 
        p.socketId === solver ? { ...p, solved: true, time } : p
      ));
    });

    socket.on('battle-royale-eliminations', ({ eliminated: elim, remaining }) => {
      setEliminated(elim);
      setLeaderboard(prev => prev.filter(p => !elim.includes(p.socketId)));
    });

    socket.on('battle-royale-finished', ({ winner: win, winnerUserId, rankings: ranks }) => {
      setGameFinished(true);
      setWinner(win);
      setRankings(ranks);
    });

    socket.on('evaluation-result', ({ ok, correct }) => {
      setEvaluating(false);
      if (ok && correct) {
        setOutput('✅ Correct! You solved it!');
      } else {
        setOutput('❌ Wrong Output. Keep trying!');
      }
    });

    return () => {
      socket.off('match-found');
      socket.off('battle-royale-round-start');
      socket.off('battle-royale-solve');
      socket.off('battle-royale-eliminations');
      socket.off('battle-royale-finished');
      socket.off('evaluation-result');
    };
  }, [socket, roomId]);

  // Emit leave on unmount (auto-eliminate)
  useEffect(() => {
    return () => {
      if (socket && roomId) {
        socket.emit('leave-br-match', { roomId });
      }
    };
  }, [socket, roomId]);

  useEffect(() => {
    if (timeLeft > 0 && !gameFinished) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft, gameFinished]);

  const submitCode = () => {
    if (!code.trim() || evaluating) return;
    setEvaluating(true);
    setOutput('Evaluating...');

    socket.emit('submit-code', {
      roomId,
      code,
      language_id: 71,
      inputOverride: question?.sampleInput
    });
  };

  if (gameFinished) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass p-12 rounded-lg text-center max-w-3xl w-full"
        >
          <Trophy className="text-primary mx-auto mb-4" size={80} />
          <h2 className="text-4xl font-bold mb-4 text-gradient">
            {winner === socket?.id ? '🏆 Champion!' : 'Battle Royale Complete'}
          </h2>
          
          <div className="mt-8 space-y-2">
            <h3 className="text-2xl font-semibold mb-4">Final Rankings</h3>
            {rankings.map((r, idx) => (
              <motion.div
                key={r.socketId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`p-4 rounded-lg ${
                  r.position === 1 ? 'bg-primary/20 border-2 border-primary' :
                  r.position <= 3 ? 'bg-yellow-500/20' :
                  'bg-dark-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold">
                    #{r.position} {r.socketId === socket?.id ? '(You)' : ''}
                  </span>
                  {r.solved && (
                    <span className="text-primary">✅ Solved in {Math.round(r.time / 1000)}s</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => navigate('/lobby')}
            className="mt-8 bg-primary text-dark-900 px-8 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition"
          >
            Return to Lobby
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Battle Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Round Info */}
          <div className="glass p-6 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gradient">Round {round}</h2>
                <p className="text-gray-400">Battle Royale</p>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-2 text-primary">
                  <Clock size={20} />
                  <span className="text-2xl font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Question */}
          <div className="glass p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-gradient">
              {question?.title || 'Loading...'}
            </h2>
            <p className="text-gray-300 mb-4 whitespace-pre-wrap">
              {question?.description || ''}
            </p>
            {question && (
              <div className="bg-dark-700 p-4 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">Sample Input:</p>
                <pre className="text-primary">{question.sampleInput}</pre>
                <p className="text-sm text-gray-400 mb-2 mt-4">Sample Output:</p>
                <pre className="text-primary">{question.sampleOutput}</pre>
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Code Editor</h3>
            <Editor
              height="400px"
              defaultLanguage="python"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on'
              }}
            />
            <button
              onClick={submitCode}
              disabled={evaluating}
              className="mt-4 w-full bg-primary text-dark-900 py-3 rounded-lg font-semibold hover:bg-cyan-400 transition disabled:opacity-50"
            >
              {evaluating ? 'Evaluating...' : 'Submit Code'}
            </button>
          </div>

          {/* Output */}
          <div className="glass p-6 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Output</h3>
            <pre className="bg-dark-700 p-4 rounded-lg text-sm overflow-x-auto">
              {output || 'Run results will appear here...'}
            </pre>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-lg sticky top-20">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Users className="mr-2" size={20} />
              Leaderboard
            </h3>
            <div className="space-y-2">
              {leaderboard
                .sort((a, b) => {
                  if (a.solved !== b.solved) return b.solved - a.solved;
                  if (a.solved && b.solved) return (a.time || Infinity) - (b.time || Infinity);
                  return 0;
                })
                .map((player, idx) => (
                  <motion.div
                    key={player.socketId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`p-3 rounded-lg ${
                      player.socketId === socket?.id
                        ? 'bg-primary/20 border-2 border-primary'
                        : player.solved
                        ? 'bg-green-500/20'
                        : 'bg-dark-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">
                        #{idx + 1} {player.socketId === socket?.id ? '(You)' : 'Player'}
                      </span>
                      {player.solved ? (
                        <span className="text-primary text-sm">✅ {Math.round(player.time / 1000)}s</span>
                      ) : (
                        <span className="text-gray-400 text-sm">⏳ Solving...</span>
                      )}
                    </div>
                  </motion.div>
                ))}
            </div>

            {eliminated.length > 0 && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <p className="text-sm text-gray-400 mb-2">Eliminated:</p>
                {eliminated.map(id => (
                  <div key={id} className="text-red-400 text-sm">
                    ❌ {id === socket?.id ? 'You' : 'Player'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Eliminated Overlay — Only for eliminated players */}
      <AnimatePresence>
        {eliminated.includes(socket?.id) && !gameFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[55]"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-gradient-to-br from-red-900/80 to-gray-900 rounded-2xl p-10 max-w-md w-full border-2 border-red-500/50 text-center shadow-2xl mx-4"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Skull className="w-20 h-20 text-red-400 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-3xl font-bold text-red-400 mb-2">ELIMINATED</h2>
              <p className="text-gray-300 mb-2">
                You have been eliminated from the Battle Royale.
              </p>
              <p className="text-gray-500 text-sm mb-8">
                Better luck next time! Keep practicing to improve your skills.
              </p>
              <button
                onClick={() => navigate('/lobby')}
                className="w-full px-8 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-red-500/30"
              >
                Return to Lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BattleRoyale;
