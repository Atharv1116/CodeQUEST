"use client"

import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import axios from "axios"
import { motion, AnimatePresence } from "framer-motion"
import {
  Trophy, TrendingUp, TrendingDown, Shield, Zap, Coins,
  Flame, Crown, Target, BarChart2, ChevronRight, Award,
  Clock, Minus, Users, Swords
} from "lucide-react"
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip
} from "recharts"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"

// ── Helpers ──────────────────────────────────────────────────────
const getTier = (r) => {
  if (!r) return { label: "Unranked", color: "#94a3b8", next: 900 }
  if (r >= 2000) return { label: "Grand Master", color: "#f97316", next: null }
  if (r >= 1600) return { label: "Master",       color: "#a855f7", next: 2000 }
  if (r >= 1300) return { label: "Diamond",      color: "#60a5fa", next: 1600 }
  if (r >= 1100) return { label: "Gold",         color: "#facc15", next: 1300 }
  if (r >= 900)  return { label: "Silver",       color: "#e2e8f0", next: 1100 }
  return            { label: "Bronze",         color: "#b45309", next: 900 }
}

const fmtDate = (ts) => {
  if (!ts) return ""
  const d = new Date(ts)
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

// ── Skeleton ─────────────────────────────────────────────────────
const Skel = ({ h = "h-32", w = "w-full", rounded = "rounded-2xl" }) => (
  <div className={`${h} ${w} ${rounded} bg-dark-800/60 animate-pulse`} />
)

// ── Stat Card ────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, accent = "#00ffc3", delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay, type: "spring", stiffness: 110 }}
    className="relative bg-dark-800/60 backdrop-blur border border-dark-600/60 rounded-2xl p-5 overflow-hidden group hover:-translate-y-1 transition-transform duration-300"
    onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 30px ${accent}18`}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
  >
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
      style={{ background: `radial-gradient(ellipse at top left, ${accent}0d 0%, transparent 65%)` }} />
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">{label}</p>
        <p className="text-3xl font-black text-white">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}12`, color: accent }}>
        {icon}
      </div>
    </div>
  </motion.div>
)

// ── Match row ────────────────────────────────────────────────────
const MatchRow = ({ match, userId, idx }) => {
  const won = match.winner?.toString() === userId?.toString() ||
    (match.winners && match.winners.map(w => w?.toString()).includes(userId?.toString()))
  const isDraw = match.draw || match.status === "draw"
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04 }}
      className="flex items-center justify-between px-4 py-3 rounded-xl border border-dark-700/40 bg-dark-900/40 hover:bg-dark-800/60 hover:border-dark-600 transition group"
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-8 rounded-full flex-shrink-0 ${isDraw ? "bg-slate-500" : won ? "bg-green-400" : "bg-red-400"}`} />
        <div>
          <p className="text-sm font-semibold text-gray-100">{match.question?.title || "Unknown Problem"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
              match.type === "2v2" ? "bg-purple-500/15 text-purple-400" :
              match.type === "battle-royale" ? "bg-orange-500/15 text-orange-400" :
              "bg-primary/10 text-primary"
            }`}>{match.type?.toUpperCase() || "1V1"}</span>
            <span className="text-xs text-gray-600">{fmtDate(match.timestamp || match.createdAt)}</span>
          </div>
        </div>
      </div>
      <span className={`text-xs font-black px-3 py-1.5 rounded-full border flex-shrink-0 ${
        isDraw
          ? "bg-slate-500/10 text-slate-400 border-slate-500/20"
          : won
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-red-500/10 text-red-400 border-red-500/20"
      }`}>
        {isDraw ? "DRAW" : won ? "WIN" : "LOSS"}
      </span>
    </motion.div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats]               = useState(null)
  const [matchHistory, setMatchHistory] = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState("overview")

  const userId = user?.id || user?._id

  useEffect(() => {
    if (!userId) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      axios.get(`${API_URL}/api/user/${userId}/stats`, { headers }).then(r => setStats(r.data)).catch(() => {}),
      axios.get(`${API_URL}/api/user/${userId}/matches`, { headers }).then(r => setMatchHistory(Array.isArray(r.data) ? r.data : [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [userId, token])

  const tier    = getTier(stats?.rating ?? user?.rating)
  const rating  = stats?.rating  ?? user?.rating  ?? 1000
  const level   = stats?.level   ?? user?.level   ?? 1
  const xp      = stats?.xp      ?? user?.xp      ?? 0
  const coins   = stats?.coins   ?? user?.coins   ?? 0
  const wins    = stats?.wins    ?? user?.wins    ?? 0
  const losses  = stats?.losses  ?? 0
  const matches = stats?.matches ?? user?.matches ?? 0
  const streak  = stats?.streak  ?? user?.streak  ?? 0

  const winRate = useMemo(() => {
    const total = wins + losses
    return total > 0 ? Math.round((wins / total) * 100) : 0
  }, [wins, losses])

  const tierProgress = useMemo(() => {
    if (!tier.next) return 100
    const prevTier = rating < 900 ? 0 : rating < 1100 ? 900 : rating < 1300 ? 1100 : rating < 1600 ? 1300 : rating < 2000 ? 1600 : 2000
    return Math.min(100, Math.round(((rating - prevTier) / (tier.next - prevTier)) * 100))
  }, [rating, tier])

  const radarData = stats ? [
    { skill: "Algorithms",      value: stats.skills?.algorithms    ?? 40 },
    { skill: "Data Structures", value: stats.skills?.dataStructures ?? 35 },
    { skill: "Debugging",       value: stats.skills?.debugging      ?? 50 },
    { skill: "Speed",           value: stats.skills?.speed          ?? 45 },
  ] : []

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-dark-900 p-6 md:p-10 space-y-6 max-w-6xl mx-auto">
      <Skel h="h-40" /> <Skel h="h-8" w="w-48" />
      <div className="grid md:grid-cols-4 gap-4">{[0,1,2,3].map(i => <Skel key={i} />)}</div>
      <div className="grid md:grid-cols-2 gap-6"><Skel h="h-72" /><Skel h="h-72" /></div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: `${tier.color}06` }} />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full blur-[120px] bg-purple-500/4" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-8 md:py-12">

        {/* ── Hero Profile Section ── */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row gap-6 mb-8 p-6 md:p-8 rounded-3xl bg-dark-800/50 border border-dark-600/60 backdrop-blur"
          style={{ boxShadow: `0 0 60px ${tier.color}0a` }}
        >
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-3xl md:text-4xl font-black text-dark-900 relative"
              style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}aa)` }}>
              {(user?.username || "?")[0].toUpperCase()}
              <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-dark-800 border-2 border-dark-700 flex items-center justify-center">
                <Crown size={12} style={{ color: tier.color }} />
              </div>
            </div>
          </div>

          {/* Name + tier */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-black text-white">{user?.username}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border"
                style={{ background: `${tier.color}15`, color: tier.color, borderColor: `${tier.color}35` }}>
                <Crown size={11} /> {tier.label}
              </span>
            </div>
            <p className="text-gray-400 text-sm mb-4">Level {level} · {matches} matches played</p>

            {/* Tier progress bar */}
            <div>
              <div className="flex justify-between text-xs mb-1.5 font-semibold">
                <span className="text-gray-500">{tier.label}</span>
                {tier.next && <span className="text-gray-500">{rating} / {tier.next}</span>}
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${tierProgress}%` }}
                  transition={{ delay: 0.3, duration: 0.9 }}
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${tier.color}, ${tier.color}aa)` }} />
              </div>
            </div>

            {/* Quick pills */}
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-700/60 border border-dark-600/60 text-sm">
                <Zap size={13} className="text-blue-400" />
                <span className="text-gray-300 font-semibold">{xp.toLocaleString()} XP</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-700/60 border border-dark-600/60 text-sm">
                <span className="text-yellow-400">🪙</span>
                <span className="text-gray-300 font-semibold">{coins.toLocaleString()} Coins</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-700/60 border border-dark-600/60 text-sm">
                <Flame size={13} className="text-orange-400" />
                <span className="text-gray-300 font-semibold">{streak} Streak</span>
              </div>
            </div>
          </div>

          {/* Rating large number */}
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">Rating</p>
            <p className="text-5xl font-black" style={{ color: tier.color }}>{rating}</p>
            <p className="text-xs text-gray-500 mt-1"># {stats?.leaderboardRank ?? "—"} global</p>
          </div>
        </motion.div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Trophy size={20} />}      label="Wins"     value={wins}    sub={`${winRate}% win rate`}          accent="#22c55e" delay={0.1} />
          <StatCard icon={<Shield size={20} />}      label="Losses"   value={losses}  sub={`${matches} total`}              accent="#f87171" delay={0.15} />
          <StatCard icon={<Flame size={20} />}       label="Streak"   value={streak}  sub={`Best: ${stats?.longestStreak ?? streak}`} accent="#f97316" delay={0.2} />
          <StatCard icon={<BarChart2 size={20} />}   label="Win Rate" value={`${winRate}%`} sub={`${wins}W / ${losses}L`}  accent="#a855f7" delay={0.25} />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 p-1 bg-dark-800/50 border border-dark-700/60 rounded-2xl w-fit">
          {["overview", "matches", "skills"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition capitalize ${
                activeTab === tab
                  ? "bg-primary text-dark-900 shadow-md shadow-primary/15"
                  : "text-gray-400 hover:text-gray-200"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid md:grid-cols-2 gap-6">

              {/* Skill radar */}
              <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl p-6">
                <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 mb-4 flex items-center gap-2">
                  <BarChart2 size={14} className="text-primary" /> Skill Distribution
                </h3>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData}>
                      <PolarGrid strokeDasharray="3 3" stroke="#334155" />
                      <PolarAngleAxis dataKey="skill" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <Radar dataKey="value" stroke="#00ffc3" fill="#00ffc3" fillOpacity={0.2} strokeWidth={2} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", fontSize: "12px" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-60 flex items-center justify-center text-gray-600 text-sm">Play matches to build your skill profile</div>
                )}
              </div>

              {/* Quick stats panel */}
              <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl p-6 flex flex-col gap-4">
                <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 flex items-center gap-2">
                  <Target size={14} className="text-primary" /> Performance
                </h3>

                {/* Win rate bar */}
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-2">
                    <span className="text-gray-400">Win Rate</span>
                    <span className="text-green-400 font-black">{winRate}%</span>
                  </div>
                  <div className="h-2.5 bg-dark-700 rounded-full overflow-hidden flex">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${winRate}%` }}
                      transition={{ delay: 0.4, duration: 0.8 }}
                      className="h-full bg-green-400 rounded-full" />
                    <motion.div initial={{ width: 0 }} animate={{ width: `${100 - winRate}%` }}
                      transition={{ delay: 0.4, duration: 0.8 }}
                      className="h-full bg-red-400/40 rounded-full" />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                    <span>{wins} wins</span><span>{losses} losses</span>
                  </div>
                </div>

                {/* Key numbers */}
                <div className="grid grid-cols-3 gap-3 mt-auto">
                  {[
                    { label: "Wins",    value: wins,             color: "text-green-400" },
                    { label: "Losses",  value: losses,           color: "text-red-400" },
                    { label: "Matches", value: matches,          color: "text-primary" },
                  ].map(s => (
                    <div key={s.label} className="bg-dark-900/50 rounded-xl p-3.5 text-center border border-dark-700/50">
                      <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* CTA buttons */}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => navigate("/lobby")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-dark-900 font-black text-sm hover:bg-cyan-400 transition shadow-lg shadow-primary/20">
                    <Swords size={14} /> Play Now
                  </button>
                  <button onClick={() => navigate("/leaderboard")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dark-600 text-gray-300 font-bold text-sm hover:border-primary/40 hover:text-primary transition">
                    <Trophy size={14} /> Leaderboard
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Matches Tab ── */}
          {activeTab === "matches" && (
            <motion.div key="matches" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-dark-800/50 border border-dark-600/60 rounded-2xl p-5">
              <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 mb-4 flex items-center gap-2">
                <Clock size={14} className="text-primary" /> Match History
              </h3>
              <div className="space-y-2">
                {matchHistory.slice(0, 15).map((m, i) => (
                  <MatchRow key={i} match={m} userId={userId} idx={i} />
                ))}
                {matchHistory.length === 0 && (
                  <div className="text-center py-16 text-gray-500">
                    <Swords size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No matches yet — start playing!</p>
                    <button onClick={() => navigate("/lobby")}
                      className="mt-4 px-5 py-2 rounded-xl bg-primary text-dark-900 font-bold text-sm hover:bg-cyan-400 transition">
                      Go to Lobby
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Skills Tab ── */}
          {activeTab === "skills" && (
            <motion.div key="skills" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="grid md:grid-cols-2 gap-6">
              <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl p-6">
                <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 mb-5 flex items-center gap-2">
                  <BarChart2 size={14} className="text-primary" /> Skill Bars
                </h3>
                <div className="space-y-4">
                  {[
                    { label: "Algorithms",      value: stats?.skills?.algorithms    ?? 40, color: "#00ffc3" },
                    { label: "Data Structures", value: stats?.skills?.dataStructures ?? 35, color: "#a855f7" },
                    { label: "Debugging",       value: stats?.skills?.debugging      ?? 50, color: "#f97316" },
                    { label: "Speed",           value: stats?.skills?.speed          ?? 45, color: "#60a5fa" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs font-semibold mb-1.5">
                        <span className="text-gray-400">{s.label}</span>
                        <span className="font-black" style={{ color: s.color }}>{s.value}</span>
                      </div>
                      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${s.value}%` }}
                          transition={{ delay: 0.3, duration: 0.7 }}
                          className="h-full rounded-full" style={{ background: s.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl p-6">
                <h3 className="text-sm uppercase tracking-widest font-bold text-gray-400 mb-5 flex items-center gap-2">
                  <Award size={14} className="text-primary" /> Achievements
                </h3>
                {stats?.badges?.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {stats.badges.map((b, i) => (
                      <motion.div key={i} initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
                        transition={{ delay: i*0.06 }} whileHover={{ scale:1.08, rotate:3 }}
                        className="bg-gradient-to-br from-primary/15 to-purple-500/10 border border-primary/25 rounded-xl p-3 text-center cursor-default">
                        <div className="text-2xl mb-1">⭐</div>
                        <p className="text-[10px] text-primary font-bold leading-tight">{b}</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-600">
                    <Award size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Win matches to earn badges!</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default Dashboard
