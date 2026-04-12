import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, LogIn, Zap, Crown, ArrowLeft, X, Hash } from 'lucide-react';
import JoinRoomModal from '../components/JoinRoomModal';

// ─── Ambient orb ──────────────────────────────────────────────────
const Orb = ({ className, delay = 0 }) => (
  <motion.div
    className={`absolute rounded-full blur-[130px] pointer-events-none ${className}`}
    animate={{ scale: [1, 1.18, 0.9, 1], opacity: [0.4, 0.55, 0.35, 0.4] }}
    transition={{ duration: 20, delay, repeat: Infinity, ease: 'easeInOut' }}
  />
)

// ─── Action card ──────────────────────────────────────────────────
const ActionCard = ({ icon: Icon, title, subtitle, tag, tagColor, accent, onClick, disabled, delay, children }) => (
  <motion.button
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, type: 'spring', stiffness: 90 }}
    onClick={onClick}
    disabled={disabled}
    className="group relative flex flex-col items-center text-center p-8 md:p-10 rounded-3xl border transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-left w-full"
    style={{
      background: 'rgba(15,21,32,0.7)',
      borderColor: `${accent}30`,
      backdropFilter: 'blur(20px)',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}60`; e.currentTarget.style.boxShadow = `0 0 60px ${accent}18, inset 0 0 40px ${accent}06` }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = `${accent}30`; e.currentTarget.style.boxShadow = 'none' }}
    whileHover={disabled ? {} : { y: -4, scale: 1.01 }}
    whileTap={disabled ? {} : { scale: 0.98 }}
  >
    {/* Hover gradient */}
    <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      style={{ background: `radial-gradient(ellipse at center top, ${accent}0c 0%, transparent 65%)` }} />

    {/* Icon */}
    <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center mb-6 flex-shrink-0"
      style={{ background: `${accent}12`, border: `1.5px solid ${accent}35` }}>
      <Icon size={36} style={{ color: accent }} />
    </div>

    <div className="relative w-full">
      <h2 className="text-2xl font-black text-white mb-2">{title}</h2>
      <p className="text-gray-400 text-sm leading-relaxed mb-5">{subtitle}</p>

      {/* Tag pill */}
      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
        style={{ background: `${tagColor}15`, color: tagColor, border: `1px solid ${tagColor}30` }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: tagColor }} />
        {tag}
      </div>
    </div>

    {children}
  </motion.button>
)

// ─── Main component ───────────────────────────────────────────────
const BattleRoyaleMode = () => {
  const navigate = useNavigate();
  const socket   = useSocket();
  const { user } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [creating, setCreating]           = useState(false);
  const [view, setView]                   = useState('main'); // 'main' | 'custom'

  // ── All logic — UNCHANGED ──────────────────────────────────
  const handleEnterQueue = () => {
    navigate('/lobby', { state: { autoJoinBattleRoyale: true } });
  };

  const handleCreateRoom = () => {
    if (!socket || !user) return;
    setCreating(true);
    socket.emit('create-custom-room', {
      userId: user.id,
      maxTeams: 10,
      maxPlayersPerTeam: 5,
      settings: { difficulty: 'medium' }
    });
    socket.once('room-created', (data) => {
      setCreating(false);
      if (data.ok) navigate(`/custom-room/${data.room.roomId}`);
    });
    socket.once('room-error', (data) => {
      setCreating(false);
      alert(`Error: ${data.error}`);
    });
  };

  // ── Custom view: Create or Join ────────────────────────────
  if (view === 'custom') {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4 relative overflow-hidden">
        <Orb className="w-[500px] h-[500px] bg-purple-500/12 -top-32 -left-32" delay={0} />
        <Orb className="w-[400px] h-[400px] bg-primary/10 bottom-0 right-0" delay={5} />

        <div className="relative z-10 max-w-2xl w-full">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-yellow-400/25 bg-yellow-400/8 text-yellow-400 text-[11px] font-black uppercase tracking-wider mb-5">
              <Crown size={11} /> Custom Room
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3">
              Your <span className="text-primary">Arena</span>
            </h1>
            <p className="text-gray-400 text-base">Create your own room or join one with a code</p>
          </motion.div>

          {/* Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <ActionCard
              icon={Plus}
              title={creating ? 'Creating…' : 'Create Room'}
              subtitle="Start a new custom room and invite your friends to battle."
              tag="You'll be the host"
              tagColor="#22c55e"
              accent="#a855f7"
              onClick={handleCreateRoom}
              disabled={creating}
              delay={0.1}
            />
            <ActionCard
              icon={LogIn}
              title="Join Room"
              subtitle="Enter a room code to join an existing private match."
              tag="6-character code"
              tagColor="#facc15"
              accent="#00ffc3"
              onClick={() => setShowJoinModal(true)}
              delay={0.18}
            />
          </div>

          {/* Back button */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-center mt-8">
            <button onClick={() => setView('main')}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-200 transition font-semibold">
              <ArrowLeft size={14} /> Back
            </button>
          </motion.div>
        </div>

        {showJoinModal && (
          <JoinRoomModal
            onClose={() => setShowJoinModal(false)}
            onJoin={(roomId) => { setShowJoinModal(false); navigate(`/custom-room/${roomId}`); }}
          />
        )}
      </div>
    );
  }

  // ── Main view: Enter Queue or Custom Room ──────────────────
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Orb decorations */}
      <Orb className="w-[600px] h-[600px] bg-purple-500/10 -top-48 -right-48" delay={0} />
      <Orb className="w-[500px] h-[500px] bg-primary/8 -bottom-32 -left-32" delay={6} />
      <Orb className="w-[300px] h-[300px] bg-blue-500/8 top-1/3 right-1/4" delay={12} />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative z-10 max-w-3xl w-full">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12">
          {/* Mode badge */}
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-[11px] font-black uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Battle Royale Mode
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-none">
            Choose Your{' '}
            <span className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #a855f7 0%, #00ffc3 100%)' }}>
              Path
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-md mx-auto leading-relaxed">
            Compete with up to 100 players in an epic coding battle.
            Find a match instantly or fight with your crew.
          </p>
        </motion.div>

        {/* Mode cards */}
        <div className="grid md:grid-cols-2 gap-5 mb-10">
          {/* Enter Queue — primary action */}
          <ActionCard
            icon={Zap}
            title="Enter Queue"
            subtitle="Jump into automatic matchmaking and get paired with players at your skill level instantly."
            tag="Quick match · No code needed"
            tagColor="#22c55e"
            accent="#00ffc3"
            onClick={handleEnterQueue}
            delay={0.15}
          />

          {/* Custom Room */}
          <ActionCard
            icon={Crown}
            title="Custom Room"
            subtitle="Create a private room or join one with a code. Perfect for playing with friends."
            tag="Private match · Invite-only"
            tagColor="#facc15"
            accent="#a855f7"
            onClick={() => setView('custom')}
            delay={0.22}
          />
        </div>

        {/* Bottom info strip */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-600 font-semibold uppercase tracking-widest mb-8">
          {[
            { dot: '#22c55e', label: 'Up to 100 players' },
            { dot: '#a855f7', label: '3 elimination rounds' },
            { dot: '#60a5fa', label: 'ELO rating' },
          ].map(s => (
            <span key={s.label} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
              {s.label}
            </span>
          ))}
        </motion.div>

        {/* Back to lobby */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-center">
          <button onClick={() => navigate('/lobby')}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-200 transition font-semibold">
            <ArrowLeft size={14} /> Back to Lobby
          </button>
        </motion.div>
      </div>

      {/* Join modal (kept for completeness) */}
      {showJoinModal && (
        <JoinRoomModal
          onClose={() => setShowJoinModal(false)}
          onJoin={(roomId) => { setShowJoinModal(false); navigate(`/custom-room/${roomId}`); }}
        />
      )}
    </div>
  );
};

export default BattleRoyaleMode;
