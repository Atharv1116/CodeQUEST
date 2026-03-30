import { useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogIn } from 'lucide-react';

const JoinRoomModal = ({ onClose, onJoin }) => {
    const socket = useSocket();
    const { user } = useAuth();
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);

    const handleJoin = () => {
        if (!socket || !user) return;

        // Validate code format
        if (!roomCode || roomCode.length !== 6) {
            setError('Room code must be 6 characters');
            return;
        }

        setJoining(true);
        setError('');

        // Emit join room event
        socket.emit('join-custom-room', {
            roomCode: roomCode.toUpperCase(),
            userId: user.id
        });

        // Listen for success
        socket.once('room-joined', (data) => {
            setJoining(false);
            if (data.ok) {
                onJoin(data.room.roomId);
            }
        });

        // Listen for errors
        socket.once('room-error', (data) => {
            setJoining(false);
            setError(data.error || 'Failed to join room');
        });
    };

    const handleCodeChange = (e) => {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (value.length <= 6) {
            setRoomCode(value);
            setError('');
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-700"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <LogIn className="w-6 h-6 text-blue-400" />
                            Join Room
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Room Code
                        </label>
                        <input
                            type="text"
                            value={roomCode}
                            onChange={handleCodeChange}
                            placeholder="Enter 6-character code"
                            maxLength={6}
                            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all"
                            autoFocus
                            disabled={joining}
                        />
                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Example: A3X9K2
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg"
                        >
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        </motion.div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={joining}
                            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleJoin}
                            disabled={joining || roomCode.length !== 6}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                        >
                            {joining ? 'Joining...' : 'Join Room'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default JoinRoomModal;
