import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Users, Crown, LogOut, Play, Check } from 'lucide-react';

const CustomRoomLobby = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const socket = useSocket();
    const { user } = useAuth();

    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [mySlot, setMySlot] = useState(null);

    useEffect(() => {
        if (!socket || !user) return;

        // Fetch room details
        const fetchRoom = async () => {
            try {
                const token = localStorage.getItem('token');
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
                const response = await fetch(`${API_URL}/api/custom-rooms/${roomId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await response.json();

                if (data.ok) {
                    setRoom(data.room);
                    // Find my slot
                    findMySlot(data.room.teams);
                }
                setLoading(false);
            } catch (error) {
                console.error('Error fetching room:', error);
                setLoading(false);
            }
        };

        fetchRoom();

        // Socket event listeners
        socket.on('room-state-update', (data) => {
            setRoom(prev => {
                if (!prev) {
                    // If room hasn't loaded yet, create initial state from socket data
                    return {
                        roomId: data.roomId,
                        roomCode: data.roomCode,
                        teams: data.teams,
                        totalPlayers: data.totalPlayers,
                        hostId: data.hostId,
                        roomStatus: data.roomStatus || 'waiting',
                        maxTeams: data.maxTeams || 10,
                        maxPlayersPerTeam: data.maxPlayersPerTeam || 10,
                        settings: data.settings || { minPlayersToStart: 10 }
                    };
                }
                return {
                    ...prev,
                    teams: data.teams,
                    totalPlayers: data.totalPlayers,
                    hostId: data.hostId || prev.hostId
                };
            });
            if (data.teams) {
                findMySlot(data.teams);
            }
        });

        socket.on('player-joined', (data) => {
            console.log('Player joined:', data);
        });

        socket.on('player-left', (data) => {
            console.log('Player left:', data);
        });

        socket.on('player-moved', (data) => {
            console.log('Player moved:', data);
        });

        socket.on('host-changed', (data) => {
            if (data.newHostId === user.id) {
                alert(data.message);
            }
            setRoom(prev => prev ? { ...prev, hostId: data.newHostId } : null);
        });

        socket.on('match-starting', (data) => {
            console.log('Match starting:', data);
        });

        socket.on('navigate-to-match', (data) => {
            navigate(data.destination);
        });

        socket.on('room-error', (data) => {
            alert(`Error: ${data.error}`);
        });

        return () => {
            socket.off('room-state-update');
            socket.off('player-joined');
            socket.off('player-left');
            socket.off('player-moved');
            socket.off('host-changed');
            socket.off('match-starting');
            socket.off('navigate-to-match');
            socket.off('room-error');
        };
    }, [socket, user, roomId, navigate]);

    const findMySlot = (teams) => {
        if (!teams || !Array.isArray(teams)) {
            setMySlot(null);
            return;
        }
        for (const team of teams) {
            for (const slot of team.slots) {
                if (slot.playerId === user.id) {
                    setMySlot({ teamNumber: team.teamNumber, slotNumber: slot.slotNumber });
                    return;
                }
            }
        }
        setMySlot(null);
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(room.roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSlotClick = (teamNumber, slotNumber, slot) => {
        if (!socket || !user || !room) return;

        // Can't switch if match started
        if (room.roomStatus !== 'waiting') return;

        // Can't take occupied or locked slots
        if (slot.playerId || slot.isLocked) return;

        // Don't switch to same slot
        if (mySlot && mySlot.teamNumber === teamNumber && mySlot.slotNumber === slotNumber) return;

        socket.emit('switch-team-slot', {
            roomId,
            userId: user.id,
            targetTeamNumber: teamNumber,
            targetSlotNumber: slotNumber
        });
    };

    const handleLeaveRoom = () => {
        if (!socket || !user) return;

        socket.emit('leave-custom-room', {
            roomId,
            userId: user.id
        });

        socket.once('room-left', () => {
            navigate('/battle-royale-mode');
        });
    };

    const handleStartMatch = () => {
        if (!socket || !user) return;

        if (room.hostId !== user.id) {
            alert('Only the host can start the match');
            return;
        }

        socket.emit('start-custom-match', {
            roomId,
            userId: user.id
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
                <div className="text-white text-xl">Loading room...</div>
            </div>
        );
    }

    if (!room) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
                <div className="text-white text-xl">Room not found</div>
            </div>
        );
    }

    const isHost = room.hostId === user.id;
    const canStart = isHost && room.totalPlayers >= room.settings.minPlayersToStart;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-gray-700">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        {/* Room Code */}
                        <div>
                            <div className="text-sm text-gray-400 mb-1">Room Code</div>
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-mono font-bold text-white tracking-wider">
                                    {room.roomCode}
                                </span>
                                <button
                                    onClick={handleCopyCode}
                                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                    title="Copy room code"
                                >
                                    {copied ? (
                                        <Check className="w-5 h-5 text-green-400" />
                                    ) : (
                                        <Copy className="w-5 h-5 text-gray-300" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Player Count */}
                        <div className="text-center">
                            <div className="text-sm text-gray-400 mb-1">Players</div>
                            <div className="flex items-center gap-2">
                                <Users className="w-6 h-6 text-purple-400" />
                                <span className="text-2xl font-bold text-white">
                                    {room.totalPlayers} / {room.maxTeams * room.maxPlayersPerTeam}
                                </span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleLeaveRoom}
                                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <LogOut className="w-5 h-5" />
                                Leave
                            </button>

                            {isHost && (
                                <button
                                    onClick={handleStartMatch}
                                    disabled={!canStart}
                                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
                                >
                                    <Play className="w-5 h-5" />
                                    Start Match
                                    {!canStart && (
                                        <span className="text-xs">
                                            ({room.settings.minPlayersToStart} min)
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Teams Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {room.teams.map((team) => (
                        <TeamCard
                            key={team.teamNumber}
                            team={team}
                            onSlotClick={handleSlotClick}
                            mySlot={mySlot}
                            hostId={room.hostId}
                            roomStatus={room.roomStatus}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

const TeamCard = ({ team, onSlotClick, mySlot, hostId, roomStatus }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700"
        >
            {/* Team Header */}
            <div className="text-center mb-3 pb-3 border-b border-gray-700">
                <h3 className="text-lg font-bold text-white">Team {team.teamNumber}</h3>
                <div className="text-xs text-gray-400 mt-1">
                    {team.slots.filter(s => s.playerId).length} / {team.slots.length}
                </div>
            </div>

            {/* Slots */}
            <div className="space-y-2">
                {team.slots.map((slot) => (
                    <PlayerSlot
                        key={slot.slotNumber}
                        slot={slot}
                        teamNumber={team.teamNumber}
                        onClick={() => onSlotClick(team.teamNumber, slot.slotNumber, slot)}
                        isMySlot={mySlot?.teamNumber === team.teamNumber && mySlot?.slotNumber === slot.slotNumber}
                        isHost={slot.playerId === hostId}
                        canClick={roomStatus === 'waiting' && !slot.playerId && !slot.isLocked}
                    />
                ))}
            </div>
        </motion.div>
    );
};

const PlayerSlot = ({ slot, teamNumber, onClick, isMySlot, isHost, canClick }) => {
    if (!slot.playerId) {
        // Empty slot
        return (
            <button
                onClick={onClick}
                disabled={!canClick}
                className={`w-full p-3 rounded-lg border-2 border-dashed transition-all ${canClick
                    ? 'border-gray-600 hover:border-purple-500 hover:bg-purple-500/10 cursor-pointer'
                    : 'border-gray-700 cursor-not-allowed opacity-50'
                    }`}
            >
                <div className="text-center text-gray-500 text-sm">
                    {slot.isLocked ? '🔒 Locked' : 'Empty'}
                </div>
            </button>
        );
    }

    // Occupied slot
    return (
        <div
            className={`p-3 rounded-lg border-2 transition-all ${isMySlot
                ? 'border-purple-500 bg-purple-500/20'
                : 'border-gray-600 bg-gray-700/50'
                }`}
        >
            <div className="flex items-center gap-2">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                    {slot.username?.[0]?.toUpperCase() || '?'}
                </div>

                {/* Username */}
                <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate flex items-center gap-1">
                        {slot.username || 'Player'}
                        {isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                    </div>
                    {isMySlot && (
                        <div className="text-xs text-purple-400">You</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomRoomLobby;
