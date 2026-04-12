"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, Medal, Award, TrendingUp, Search, Crown, Star, Zap, Users } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"

// ── Helpers ──────────────────────────────────────────────────────
const getTier = (r) => {
  if (!r) return { label: "Unranked", color: "#94a3b8" }
  if (r >= 2000) return { label: "Grand Master", color: "#f97316" }
  if (r >= 1600) return { label: "Master",       color: "#a855f7" }
  if (r >= 1300) return { label: "Diamond",      color: "#60a5fa" }
  if (r >= 1100) return { label: "Gold",         color: "#facc15" }
  if (r >= 900)  return { label: "Silver",       color: "#e2e8f0" }
  return            { label: "Bronze",         color: "#b45309" }
}

const RANK_META = [
  { bg: "from-yellow-400/20 to-yellow-500/5", border: "border-yellow-400/50", text: "text-yellow-400", icon: <Trophy size={20} className="text-yellow-400" />, label: "Gold" },
  { bg: "from-slate-300/15 to-slate-400/5",   border: "border-slate-300/40",  text: "text-slate-300",  icon: <Medal size={20} className="text-slate-300" />,   label: "Silver" },
  { bg: "from-orange-500/15 to-orange-600/5", border: "border-orange-400/40", text: "text-orange-400", icon: <Award size={20} className="text-orange-400" />,   label: "Bronze" },
]

// ── Skeleton row ─────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
    <div className="w-10 h-10 rounded-xl bg-dark-700 flex-shrink-0" />
    <div className="w-10 h-10 rounded-full bg-dark-700 flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 w-32 bg-dark-700 rounded" />
      <div className="h-2.5 w-20 bg-dark-700 rounded" />
    </div>
    <div className="h-3.5 w-16 bg-dark-700 rounded" />
    <div className="h-3.5 w-12 bg-dark-700 rounded" />
    <div className="h-3.5 w-12 bg-dark-700 rounded" />
  </div>
)

// ── Top-3 podium card ─────────────────────────────────────────────
const PodiumCard = ({ player, rank, isMe }) => {
  const meta  = RANK_META[rank - 1]
  const tier  = getTier(player.rating)
  const order = rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"
  const height = rank === 1 ? "mt-0" : rank === 2 ? "mt-6" : "mt-10"

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1, type: "spring", stiffness: 100 }}
      className={`${order} ${height} flex-1 min-w-0`}
    >
      <div className={`relative flex flex-col items-center p-4 rounded-2xl border bg-gradient-to-b ${meta.bg} ${meta.border} ${isMe ? "ring-2 ring-primary" : ""}`}
        style={{ boxShadow: rank === 1 ? `0 0 40px rgba(250,204,21,0.15)` : "none" }}>
        {isMe && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] bg-primary text-dark-900 font-black px-2 py-0.5 rounded-full">YOU</span>}
        <div className="mb-3">{meta.icon}</div>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black text-dark-900 mb-2"
          style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}aa)` }}>
          {(player.username || "?")[0].toUpperCase()}
        </div>
        <p className={`font-black text-sm text-center truncate ${isMe ? "text-primary" : "text-gray-100"} max-w-[90px]`}>
          {player.username}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{tier.label}</p>
        <div className="mt-3 flex flex-col items-center">
          <p className={`text-2xl font-black ${meta.text}`}>{player.rating}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Rating</p>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Trophy size={11} className="text-green-400" /> {player.wins ?? 0}W
        </div>
      </div>
    </motion.div>
  )
}

// ── Table row ─────────────────────────────────────────────────────
const TableRow = ({ player, rank, isMe, idx }) => {
  const tier = getTier(player.rating)
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.03 }}
      className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border transition group cursor-default ${
        isMe
          ? "bg-primary/8 border-primary/30"
          : "bg-dark-900/30 border-dark-700/40 hover:bg-dark-800/60 hover:border-dark-600"
      }`}
    >
      {/* Rank number */}
      <div className="w-8 text-center flex-shrink-0">
        <span className={`text-sm font-black ${isMe ? "text-primary" : "text-gray-500"}`}>#{rank}</span>
      </div>

      {/* Avatar */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-dark-900 flex-shrink-0 text-sm"
        style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}99)` }}>
        {(player.username || "?")[0].toUpperCase()}
      </div>

      {/* Name + tier */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-bold text-sm truncate ${isMe ? "text-primary" : "text-gray-100"}`}>
            {player.username}
            {isMe && <span className="ml-1.5 text-xs text-gray-500 font-normal">(you)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${tier.color}15`, color: tier.color }}>
            {tier.label}
          </span>
          {player.college && <span className="text-[10px] text-gray-600 truncate">{player.college}</span>}
        </div>
      </div>

      {/* Rating */}
      <div className="text-right flex-shrink-0">
        <p className="font-black text-base" style={{ color: tier.color }}>{player.rating ?? "—"}</p>
        <p className="text-[10px] text-gray-600 uppercase tracking-wide">Rating</p>
      </div>

      {/* Wins */}
      <div className="text-right flex-shrink-0 w-14">
        <p className="font-bold text-sm text-green-400">{player.wins ?? 0}</p>
        <p className="text-[10px] text-gray-600 uppercase tracking-wide">Wins</p>
      </div>

      {/* Level */}
      <div className="text-right flex-shrink-0 w-12 hidden sm:block">
        <p className="font-bold text-sm text-purple-400">Lv.{player.level ?? 1}</p>
        <p className="text-[10px] text-gray-600 uppercase tracking-wide">Level</p>
      </div>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
const Leaderboard = () => {
  const { user } = useAuth()
  const [leaderboard, setLeaderboard] = useState([])
  const [type, setType]       = useState("global")
  const [college, setCollege] = useState("")
  const [search, setSearch]   = useState("")
  const [loading, setLoading] = useState(true)
  const myUserId = user?.id?.toString() || user?._id?.toString()

  useEffect(() => {
    setLoading(true)
    axios.get(`${API_URL}/api/leaderboard`, { params: { type, college } })
      .then(r => setLeaderboard(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false))
  }, [type, college])

  const filtered = useMemo(() => {
    if (!search.trim()) return leaderboard
    const q = search.toLowerCase()
    return leaderboard.filter(p => p.username?.toLowerCase().includes(q) || p.college?.toLowerCase().includes(q))
  }, [leaderboard, search])

  const top3     = filtered.slice(0, 3)
  const rest     = filtered.slice(3)

  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/4 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 py-10 md:py-14">
        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.35em] text-primary font-bold mb-2">Global Rankings</p>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">
            <span className="text-primary">Leader</span>board
          </h1>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            The best competitive programmers on CodeQuest. Where do you rank?
          </p>
        </motion.div>

        {/* ── Controls ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-wrap items-center gap-3 mb-8">
          {/* Type tabs */}
          <div className="flex gap-1 p-1 bg-dark-800/60 border border-dark-700/60 rounded-xl">
            {["global", "college"].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition ${
                  type === t ? "bg-primary text-dark-900 shadow" : "text-gray-400 hover:text-gray-200"
                }`}>
                {t === "global" ? <span className="flex items-center gap-1.5"><Users size={13} /> Global</span>
                  : <span className="flex items-center gap-1.5"><Star size={13} /> College</span>}
              </button>
            ))}
          </div>

          {/* College filter */}
          <AnimatePresence>
            {type === "college" && (
              <motion.input initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}
                value={college} onChange={e => setCollege(e.target.value)}
                placeholder="College name…"
                className="bg-dark-800/60 border border-dark-600 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary/60 transition"
              />
            )}
          </AnimatePresence>

          {/* Search */}
          <div className="flex-1 min-w-[160px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search player…"
              className="w-full bg-dark-800/60 border border-dark-600 rounded-xl pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary/60 transition"
            />
          </div>

          {/* Count badge */}
          <span className="text-xs text-gray-500 font-semibold flex items-center gap-1">
            <TrendingUp size={13} /> {filtered.length} players
          </span>
        </motion.div>

        {loading ? (
          <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl overflow-hidden divide-y divide-dark-700/40">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Trophy size={36} className="mx-auto mb-3 opacity-20" />
            <p>No players found.</p>
          </div>
        ) : (
          <>
            {/* ── Podium top-3 ── */}
            {top3.length >= 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                className="flex items-end justify-center gap-3 mb-10">
                {top3.map((p, idx) => (
                  <PodiumCard key={p._id || idx} player={p} rank={idx + 1}
                    isMe={!!(myUserId && (p._id?.toString() === myUserId || p.id?.toString() === myUserId))} />
                ))}
              </motion.div>
            )}

            {/* ── Table ── */}
            <div className="bg-dark-800/50 border border-dark-600/60 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-dark-700 bg-dark-800/80">
                <div className="w-8 text-[10px] uppercase tracking-widest font-bold text-gray-600">Rank</div>
                <div className="w-9" />
                <div className="flex-1 text-[10px] uppercase tracking-widest font-bold text-gray-600">Player</div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 text-right">Rating</div>
                <div className="w-14 text-[10px] uppercase tracking-widest font-bold text-gray-600 text-right">Wins</div>
                <div className="w-12 hidden sm:block text-[10px] uppercase tracking-widest font-bold text-gray-600 text-right">Level</div>
              </div>

              <div className="p-2 space-y-1.5">
                {/* Top 3 in table too */}
                {filtered.map((player, idx) => (
                  <TableRow
                    key={player._id || idx}
                    player={player}
                    rank={idx + 1}
                    idx={idx}
                    isMe={!!(myUserId && (player._id?.toString() === myUserId || player.id?.toString() === myUserId))}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Leaderboard
