"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { useSocket } from "../contexts/SocketContext"
import { useAuth } from "../contexts/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users, Zap, Swords, Trophy, TrendingUp, Star, Shield,
  Crown, Target, BarChart2, ChevronRight, Flame
} from "lucide-react"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

const StatPill = ({ icon, label, value, accent = '#00ffc3' }) => (
  <div className="flex flex-col items-center gap-1 px-4 py-3 bg-dark-800/70 border border-dark-600/60 rounded-2xl min-w-[80px]">
    <div style={{ color: accent }}>{icon}</div>
    <p className="text-lg font-black text-white leading-none">{value ?? '—'}</p>
    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">{label}</p>
  </div>
)

const ModeCard = ({ icon, title, desc, badge, accent = '#00ffc3', onClick }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.035, y: -4 }}
    whileTap={{ scale: 0.97 }}
    className="relative w-full text-left bg-dark-800/60 backdrop-blur border border-dark-600/60 rounded-3xl p-6 overflow-hidden group transition-shadow duration-300"
    style={{ boxShadow: 'none' }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 40px ${accent}18`}
    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
  >
    {/* Glow layer */}
    <div
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      style={{ background: `radial-gradient(ellipse at top left, ${accent}10 0%, transparent 65%)` }}
    />
    {badge && (
      <span
        className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
        style={{ background: `${accent}15`, color: accent, borderColor: `${accent}40` }}
      >
        {badge}
      </span>
    )}
    <div className="relative flex items-start gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
        style={{ background: `${accent}12`, border: `1.5px solid ${accent}35` }}
      >
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <div className="flex-1 pt-0.5">
        <h2 className="text-xl font-black text-white tracking-wide mb-1">{title}</h2>
        <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
        <div
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 group-hover:gap-2.5"
          style={{ color: accent }}
        >
          Join Queue <ChevronRight size={13} />
        </div>
      </div>
    </div>
  </motion.button>
)

// ────────────────────────────────────────────────────────────────
// Main Lobby component
// ────────────────────────────────────────────────────────────────
const Lobby = () => {
  const [queueStatus, setQueueStatus] = useState({ mode: null, size: 0 })
  const [searching, setSearching]     = useState(false)
  const [matchOverlay, setMatchOverlay] = useState(null)
  const [countdown, setCountdown]     = useState(5)
  const [overlayMessage, setOverlayMessage] = useState("")
  const [leaveModal, setLeaveModal]   = useState({ open: false, nextPath: null })
  const prefersReducedMotion = usePrefersReducedMotion()
  const countdownRef   = useRef(null)
  const leaveConfirmRef = useRef(null)
  const socket   = useSocket()
  const navigate = useNavigate()
  const { user, token } = useAuth()

  const guardActive = useMemo(() => searching || Boolean(matchOverlay), [searching, matchOverlay])

  // ── User stats derived ─────────────────────────────────────
  const winRate = useMemo(() => {
    if (!user?.wins && !user?.losses) return null
    const total = (user.wins || 0) + (user.losses || 0)
    return total > 0 ? Math.round((user.wins / total) * 100) : 0
  }, [user])

  // ── Socket listeners ───────────────────────────────────────
  useEffect(() => {
    if (!socket) return
    socket.on("queued", (data) => {
      setTimeout(() => {
        setQueueStatus({ mode: data.mode, size: data.queueSize, position: data.position, team: data.team, teamStatus: data.teamStatus, teamBlueSize: data.teamBlueSize, teamRedSize: data.teamRedSize })
        setSearching(true)
      }, 0)
    })
    socket.on("match-found", (data) => {
      setTimeout(() => {
        setSearching(false)
        setMatchOverlay({ ...data, questionTitle: data.question?.title || "Mystery Problem", questionDifficulty: data.question?.difficulty || "???", })
      }, 0)
    })
    socket.on("match-finished", (payload) => {
      if (!matchOverlay) return
      if (payload.roomId === matchOverlay.roomId && payload.reason === "opponent-disconnected") {
        setOverlayMessage("Opponent disconnected, returning you to the queue.")
        setMatchOverlay(null); setSearching(false)
        setTimeout(() => setOverlayMessage(""), 3000)
      }
    })
    return () => { socket.off("queued"); socket.off("match-found"); socket.off("match-finished") }
  }, [socket, matchOverlay])

  useEffect(() => {
    if (!matchOverlay) { clearInterval(countdownRef.current); return undefined }
    setCountdown(5)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); finalizeCountdown("auto"); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [matchOverlay])

  useEffect(() => { window.__codequestLobbyGuard = { active: guardActive } }, [guardActive])

  useEffect(() => {
    if (!guardActive) return
    const h = (e) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [guardActive])

  useEffect(() => {
    const h = (e) => { if (!guardActive) return; e.preventDefault?.(); setLeaveModal({ open: true, nextPath: e.detail?.nextPath || "/" }) }
    window.addEventListener("lobby-leave-request", h)
    return () => window.removeEventListener("lobby-leave-request", h)
  }, [guardActive])

  useEffect(() => {
    if (!leaveModal.open) return
    leaveConfirmRef.current?.focus()
    const h = (e) => { if (e.key === "Escape") closeLeaveModal() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [leaveModal.open])

  const finalizeCountdown = (reason) => {
    if (!matchOverlay) return
    clearInterval(countdownRef.current)
    const dest = matchOverlay.type === "battle-royale" ? `/battle-royale/${matchOverlay.roomId}` : `/battle/${matchOverlay.roomId}`
    setMatchOverlay(null); navigate(dest)
  }

  const joinGame = (mode) => {
    if (!socket) return
    setSearching(true); setQueueStatus({ mode, size: 0 })
    if (mode === "1v1")          socket.emit("join-1v1")
    else if (mode === "2v2")     socket.emit("join-2v2")
    else if (mode === "battle-royale") socket.emit("join-battle-royale")
  }

  const cancelSearch    = () => { setSearching(false); setQueueStatus({ mode: null, size: 0 }) }
  const handleReadyNow  = () => finalizeCountdown("ready-button")
  const handleCancelMatch = () => { setMatchOverlay(null); setOverlayMessage("Match cancelled."); setTimeout(() => setOverlayMessage(""), 2500) }
  const closeLeaveModal = () => setLeaveModal({ open: false, nextPath: null })
  const handleLeaveConfirm = async () => {
    try {
      if (matchOverlay && token) {
        await axios.post(`/api/match/${matchOverlay.roomId}/forfeit`, { reason: "user-request" }, { headers: { Authorization: `Bearer ${token}` } })
        socket?.emit("player_left_match", { roomId: matchOverlay.roomId, userId: user?.id || user?._id, reason: "forfeit" })
      }
    } catch (e) { console.error(e) } finally {
      setMatchOverlay(null); setSearching(false); setQueueStatus({ mode: null, size: 0 })
      setLeaveModal({ open: false, nextPath: null }); navigate(leaveModal.nextPath || "/dashboard")
    }
  }

  // ── Tier badge ─────────────────────────────────────────────
  const getTier = (rating) => {
    if (!rating) return { label: 'Unranked', color: '#94a3b8' }
    if (rating >= 2000) return { label: 'Grand Master', color: '#f97316' }
    if (rating >= 1600) return { label: 'Master',       color: '#a855f7' }
    if (rating >= 1300) return { label: 'Diamond',      color: '#60a5fa' }
    if (rating >= 1100) return { label: 'Gold',         color: '#facc15' }
    if (rating >= 900)  return { label: 'Silver',       color: '#94a3b8' }
    return { label: 'Bronze', color: '#b45309' }
  }
  const tier = getTier(user?.rating)

  // ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10 md:py-14">

        {/* ── Page header ── */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-xs uppercase tracking-[0.35em] text-primary font-bold mb-1">CodeQuest Arena</p>
          <h1 className="text-4xl md:text-5xl font-black text-white">Battle <span className="text-gradient">Arena</span></h1>
          <p className="text-gray-400 mt-2 text-base">Select your mode and join the queue</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">

          {/* ── LEFT: Profile + Stats ── */}
          {user && (
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="lg:col-span-1 flex flex-col gap-4"
            >
              {/* Profile Card */}
              <div className="bg-dark-800/60 backdrop-blur border border-dark-600/60 rounded-3xl p-6 relative overflow-hidden">
                {/* Tier glow */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${tier.color}08 0%, transparent 60%)` }} />
                <div className="relative">
                  {/* Avatar */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-dark-900" style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}aa)` }}>
                      {user.username?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-xl font-black text-white">{user.username}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full mt-1 border" style={{ background: `${tier.color}15`, color: tier.color, borderColor: `${tier.color}35` }}>
                        <Crown size={10} /> {tier.label}
                      </span>
                    </div>
                  </div>

                  {/* Rating bar */}
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-semibold">
                      <span>Rating</span>
                      <span className="text-white font-black">{user.rating ?? '—'}</span>
                    </div>
                    <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${Math.min(((user.rating || 0) / 2000) * 100, 100)}%` }}
                        transition={{ delay: 0.4, duration: 0.8 }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${tier.color}, ${tier.color}aa)` }}
                      />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatPill icon={<Trophy size={16} />} label="Rating"   value={user.rating}  accent={tier.color} />
                    <StatPill icon={<Flame size={16} />}  label="Streak"   value={user.streak}  accent="#f97316" />
                    <StatPill icon={<Shield size={16} />} label="Wins"     value={user.wins}    accent="#22c55e" />
                    <StatPill icon={<Target size={16} />} label="Matches"  value={user.matches} accent="#60a5fa" />
                  </div>

                  {/* Win rate bar */}
                  {winRate !== null && (
                    <div className="mt-4 p-3.5 bg-dark-900/50 rounded-xl border border-dark-700/50">
                      <div className="flex justify-between text-xs mb-2 font-semibold">
                        <span className="text-gray-400">Win Rate</span>
                        <span className="text-primary font-black">{winRate}%</span>
                      </div>
                      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${winRate}%` }}
                          transition={{ delay: 0.5, duration: 0.8 }}
                          className="h-full bg-primary rounded-full"
                        />
                      </div>
                    </div>
                  )}

                  {/* XP row */}
                  <div className="mt-3 flex items-center justify-between text-xs px-1">
                    <div className="flex items-center gap-1.5 text-blue-400 font-bold"><Zap size={12} /> XP: <span className="text-white">{user.xp ?? 0}</span></div>
                    <div className="flex items-center gap-1.5 text-yellow-400 font-bold">🪙 Coins: <span className="text-white">{user.coins ?? 0}</span></div>
                  </div>
                </div>
              </div>

              {/* Leaderboard CTA */}
              <button
                onClick={() => navigate('/leaderboard')}
                className="flex items-center justify-between px-5 py-3.5 bg-dark-800/60 border border-dark-600/60 rounded-2xl text-sm group hover:border-primary/40 hover:bg-dark-700/60 transition"
              >
                <div className="flex items-center gap-2.5">
                  <BarChart2 size={16} className="text-primary" />
                  <span className="text-gray-300 font-semibold">Global Leaderboard</span>
                </div>
                <ChevronRight size={15} className="text-gray-500 group-hover:text-primary transition" />
              </button>
            </motion.div>
          )}

          {/* ── RIGHT: Mode cards ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
            className="lg:col-span-2 flex flex-col gap-4"
          >
            <ModeCard
              icon={<Swords size={26} />}
              title="1v1 Duel"
              desc="Face off against a single opponent. First correct submission wins. Pure skill — no luck."
              accent="#00ffc3"
              onClick={() => joinGame("1v1")}
            />
            <ModeCard
              icon={<Users size={26} />}
              title="2v2 Team Battle"
              desc="Team up with a partner. Both teammates must solve the problem to secure the win."
              badge="Co-op"
              accent="#a855f7"
              onClick={() => joinGame("2v2")}
            />
            <ModeCard
              icon={<Zap size={26} />}
              title="Battle Royale"
              desc="Up to 50 coders. 3 rounds of increasing difficulty. Last coder standing wins!"
              badge="Hot"
              accent="#f97316"
              onClick={() => navigate("/battle-royale-mode")}
            />
          </motion.div>
        </div>
      </div>

      {/* ── Searching overlay ── */}
      <AnimatePresence>
        {searching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              className="bg-dark-800/90 border border-dark-600 rounded-3xl p-10 text-center max-w-sm w-full mx-4 shadow-2xl">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
                <div className="absolute inset-2 rounded-full bg-dark-900 flex items-center justify-center">
                  <Swords size={22} className="text-primary" />
                </div>
              </div>
              <p className="text-xl font-black text-white mb-2">Searching...</p>
              <p className="text-gray-400 text-sm mb-6 min-h-[20px]">
                {queueStatus.mode === "1v1" && "Looking for 1 more player"}
                {queueStatus.mode === "2v2" && (
                  queueStatus.teamStatus === "complete"
                    ? `Team ${queueStatus.team === "blue" ? "Blue" : "Red"} ready — waiting for opponents`
                    : `Position ${queueStatus.position || queueStatus.size}/4 · Team ${queueStatus.team === "blue" ? "Blue" : "Red"} (${queueStatus.team === "blue" ? queueStatus.teamBlueSize : queueStatus.teamRedSize}/2)`
                )}
                {queueStatus.mode === "battle-royale" && `${queueStatus.size} players in queue`}
              </p>
              <button onClick={cancelSearch} className="text-sm text-gray-400 hover:text-red-400 transition font-semibold underline underline-offset-4">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Match found overlay ── */}
      <AnimatePresence>
        {matchOverlay && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 px-4">
            <motion.div initial={{ scale: prefersReducedMotion ? 1 : 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }} transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="bg-dark-800/95 border border-primary/30 rounded-3xl p-8 md:p-10 text-center max-w-lg w-full shadow-[0_0_80px_rgba(0,255,195,0.1)]">

              <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="text-xs uppercase tracking-[0.35em] text-primary font-bold mb-2">Match Found!</motion.p>
              <motion.h2 initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ delay: 0.15 }}
                className="text-4xl font-black text-white mb-6">Opponent Ready!</motion.h2>

              {/* Problem info */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-dark-900/60 border border-dark-700 rounded-2xl p-4 mb-6">
                <p className="text-gray-200 font-semibold mb-2">{matchOverlay.questionTitle}</p>
                <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase
                  ${matchOverlay.questionDifficulty === "easy" ? "bg-emerald-500/20 text-emerald-400"
                    : matchOverlay.questionDifficulty === "medium" ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"}`}>
                  {matchOverlay.questionDifficulty}
                </span>
              </motion.div>

              {/* Players */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                className="flex items-center justify-center gap-8 mb-6">
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-right">
                  <p className="text-lg font-black text-primary">{user?.username ?? "You"}</p>
                  <p className="text-xs text-gray-500">Rating {user?.rating ?? 1000}</p>
                </motion.div>
                <p className="text-gray-600 text-2xl font-light">vs</p>
                <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-left">
                  <p className="text-lg font-black text-gray-200">Mystery Rival</p>
                  <p className="text-xs text-gray-500">Skill-Matched</p>
                </motion.div>
              </motion.div>

              {/* Countdown circle */}
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                className="flex items-center justify-center mb-6">
                <div className="relative w-28 h-28">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r="52" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <motion.circle cx="56" cy="56" r="52" fill="none" stroke="#00ffc3" strokeWidth="3"
                      strokeDasharray={2 * Math.PI * 52}
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 52 }}
                      transition={{ duration: 5, ease: "linear" }}
                    />
                  </svg>
                  <div className="absolute inset-2 rounded-full bg-dark-900 flex items-center justify-center">
                    <motion.span key={countdown} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl font-black text-primary">{countdown}</motion.span>
                  </div>
                </div>
              </motion.div>

              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                <button onClick={handleCancelMatch}
                  className="px-6 py-3 rounded-xl border-2 border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold transition text-sm">
                  Cancel
                </button>
                <button onClick={handleReadyNow}
                  className="px-8 py-3 rounded-xl bg-primary text-dark-900 font-black shadow-lg shadow-primary/30 hover:bg-cyan-400 transition text-sm">
                  Ready Now!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast message ── */}
      <AnimatePresence>
        {overlayMessage && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-dark-800 border border-dark-600 text-gray-100 px-5 py-2.5 rounded-full shadow-xl text-sm font-semibold">
            {overlayMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Leave modal ── */}
      <AnimatePresence>
        {leaveModal.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] px-4"
            role="dialog" aria-modal="true">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="bg-dark-800 border border-dark-600 w-full max-w-md rounded-2xl p-6 shadow-2xl">
              <h3 className="text-2xl font-black text-white mb-2">Leave Match?</h3>
              <p className="text-gray-400 mb-5 text-sm">You will forfeit the match and your opponent will be awarded the win.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={closeLeaveModal}
                  className="px-4 py-2 rounded-xl border border-dark-500 text-gray-200 hover:bg-dark-700 transition text-sm font-semibold">
                  No — Stay
                </button>
                <button ref={leaveConfirmRef} onClick={handleLeaveConfirm}
                  className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold hover:bg-red-400 transition text-sm">
                  Yes — Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Lobby
