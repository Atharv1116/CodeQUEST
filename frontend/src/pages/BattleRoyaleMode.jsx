import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { Users, Plus, LogIn, Zap, Crown } from 'lucide-react';
import JoinRoomModal from '../components/JoinRoomModal';

const BattleRoyaleMode = () => {
    const navigate = useNavigate();
    const socket = useSocket();
    const { user } = useAuth();
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [view, setView] = useState('main'); // 'main' or 'custom'

    const handleEnterQueue = () => {
        // Navigate back to lobby and trigger battle royale queue
        navigate('/lobby', { state: { autoJoinBattleRoyale: true } });
    };

    const handleCreateRoom = () => {
        if (!socket || !user) return;

        setCreating(true);

        // Emit create room event
        socket.emit('create-custom-room', {
            userId: user.id,
            maxTeams: 10,
            maxPlayersPerTeam: 5,
            settings: {
                difficulty: 'medium'
            }
        });

        // Listen for room created
        socket.once('room-created', (data) => {
            setCreating(false);
            if (data.ok) {
                // Navigate to custom room lobby
                navigate(`/custom-room/${data.room.roomId}`);
            }
        });

        socket.once('room-error', (data) => {
            setCreating(false);
            alert(`Error: ${data.error}`);
        });
    };

    if (view === 'custom') {
        // Custom Room View: Create or Join
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
                <div className="max-w-4xl w-full">
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center mb-12"
                    >
                        <h1 className="text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                            <Crown className="w-12 h-12 text-yellow-400" />
                            Custom Room
                        </h1>
                        <p className="text-gray-300 text-lg">
                            Create your own room or join with a code
                        </p>
                    </motion.div>

                    {/* Mode Selection */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Create Room */}
                        <motion.button
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            onClick={handleCreateRoom}
                            disabled={creating}
                            className="group relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-8 hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Plus className="w-10 h-10 text-white" />
                                </div>

                                <h2 className="text-2xl font-bold text-white mb-2">
                                    {creating ? 'Creating...' : 'Create Room'}
                                </h2>

                                <p className="text-purple-100">
                                    Start a new custom room and invite your friends
                                </p>

                                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-purple-200">
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                    <span>You'll be the host</span>
                                </div>
                            </div>
                        </motion.button>

                        {/* Join Room */}
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            onClick={() => setShowJoinModal(true)}
                            className="group relative bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-8 hover:scale-105 transition-all duration-300"
                        >
                            <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <LogIn className="w-10 h-10 text-white" />
                                </div>

                                <h2 className="text-2xl font-bold text-white mb-2">
                                    Join Room
                                </h2>

                                <p className="text-blue-100">
                                    Enter a room code to join an existing match
                                </p>

                                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-blue-200">
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                    <span>6-character code required</span>
                                </div>
                            </div>
                        </motion.button>
                    </div>

                    {/* Back Button */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-center mt-8"
                    >
                        <button
                            onClick={() => setView('main')}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            ← Back
                        </button>
                    </motion.div>
                </div>

                {/* Join Room Modal */}
                {showJoinModal && (
                    <JoinRoomModal
                        onClose={() => setShowJoinModal(false)}
                        onJoin={(roomId) => {
                            setShowJoinModal(false);
                            navigate(`/custom-room/${roomId}`);
                        }}
                    />
                )}
            </div>
        );
    }

    // Main View: Enter Queue or Custom Room
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-5xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                        <Users className="w-12 h-12 text-purple-400" />
                        Battle Royale
                    </h1>
                    <p className="text-gray-300 text-lg">
                        Compete with up to 100 players in an epic coding battle
                    </p>
                </motion.div>

                {/* Mode Selection */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Enter Queue */}
                    <motion.button
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        onClick={handleEnterQueue}
                        className="group relative bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl p-8 hover:scale-105 transition-all duration-300"
                    >
                        <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="relative z-10">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap className="w-10 h-10 text-white" />
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-2">
                                Enter Queue
                            </h2>

                            <p className="text-green-100">
                                Join automatic matchmaking and find players instantly
                            </p>

                            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-green-200">
                                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                <span>Quick match</span>
                            </div>
                        </div>
                    </motion.button>

                    {/* Custom Room */}
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        onClick={() => setView('custom')}
                        className="group relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-8 hover:scale-105 transition-all duration-300"
                    >
                        <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="relative z-10">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Crown className="w-10 h-10 text-white" />
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-2">
                                Custom Room
                            </h2>

                            <p className="text-purple-100">
                                Create or join a private room with friends
                            </p>

                            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-purple-200">
                                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                <span>Private matches</span>
                            </div>
                        </div>
                    </motion.button>
                </div>

                {/* Back Button */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-center mt-8"
                >
                    <button
                        onClick={() => navigate('/lobby')}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        ← Back to Lobby
                    </button>
                </motion.div>
            </div>
        </div>
    );
};

export default BattleRoyaleMode;
