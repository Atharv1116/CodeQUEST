"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { motion } from "framer-motion"
import { Trophy, Users, Zap, Brain, ArrowRight, Code2, ChevronRight, Star } from "lucide-react"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"
import { ANIMATION_TIMING } from "../utils/animations"

// ── Floating-orb background (static colours, animated scale) ─────
const Orb = ({ className, delay = 0, dur = 22 }) => (
  <motion.div
    className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`}
    animate={{ scale: [1, 1.15, 0.92, 1], opacity: [0.45, 0.6, 0.4, 0.45] }}
    transition={{ duration: dur, delay, repeat: Infinity, ease: "easeInOut" }}
  />
)

// ── Feature card data ─────────────────────────────────────────────
const FEATURES = [
  {
    icon: Users,
    title: "Multiplayer Battles",
    description: "Compete in 1v1 duels, 2v2 team battles, or Battle Royale tournaments.",
    accent: "#00ffc3",
    span: "md:col-span-2",
    size: "large",
  },
  {
    icon: Brain,
    title: "AI Tutor Coach",
    description: "Get personalized feedback, hints, and skill recommendations from AI.",
    accent: "#a855f7",
    span: "",
    size: "normal",
  },
  {
    icon: Trophy,
    title: "Gamification",
    description: "Earn XP, coins, badges, and climb the ELO-based leaderboard.",
    accent: "#facc15",
    span: "",
    size: "normal",
  },
  {
    icon: Zap,
    title: "Real-Time Features",
    description: "Live code editor, instant matchmaking, and real-time leaderboards.",
    accent: "#60a5fa",
    span: "md:col-span-2",
    size: "large",
  },
]

// ── Stat counter pill ────────────────────────────────────────────
const StatPill = ({ value, label, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay, type: "spring", stiffness: 100 }}
    className="flex flex-col items-center px-6 py-3 rounded-2xl bg-dark-800/60 border border-dark-600/60 backdrop-blur"
  >
    <span className="text-2xl font-black text-primary">{value}</span>
    <span className="text-xs text-gray-500 font-semibold uppercase tracking-widest mt-0.5">{label}</span>
  </motion.div>
)

const Home = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [ctaAnimating, setCtaAnimating] = useState(false)

  // ── original logic — unchanged ──────────────────────────────
  const handleGetStarted = () => {
    if (!prefersReducedMotion) {
      setCtaAnimating(true)
      setTimeout(() => navigate("/register"), ANIMATION_TIMING.base)
    } else {
      navigate("/register")
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 overflow-hidden relative">
      {/* ── Global background orbs ── */}
      <Orb className="w-[600px] h-[600px] bg-primary/10 -top-40 -left-40" delay={0} />
      <Orb className="w-[500px] h-[500px] bg-purple-500/10 top-1/2 -right-32" delay={4} dur={25} />
      <Orb className="w-[350px] h-[350px] bg-blue-500/8 bottom-20 left-1/3" delay={8} dur={18} />

      {/* ── Hero Section ─────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-4 pt-24 pb-20 md:pt-36 md:pb-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={ctaAnimating
            ? { opacity: 0, y: -24, scale: 0.98 }
            : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: ANIMATION_TIMING.base / 1000, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-xs font-bold uppercase tracking-[0.25em] mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Welcome to the arena
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="text-6xl md:text-8xl font-black mb-6 leading-[0.95] tracking-tight"
          >
            <span className="text-white">Code</span>
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #00ffc3 0%, #60a5fa 50%, #a855f7 100%)" }}
            >
              Quest
            </span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="text-xl md:text-2xl text-gray-300 mb-5 max-w-2xl mx-auto leading-relaxed font-medium"
          >
            Master competitive programming through real-time battles,
            AI-powered coaching, and gamified learning.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.6 }}
            className="text-gray-500 max-w-xl mx-auto mb-12 text-base leading-relaxed"
          >
            Challenge yourself in 1v1 duels, team battles, or multi-player tournaments.
            Track your skills, unlock badges, and climb the global leaderboard.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14"
          >
            {user ? (
              <motion.div whileHover={prefersReducedMotion ? {} : { scale: 1.05 }} whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}>
                <Link
                  to="/lobby"
                  className="inline-flex items-center gap-2.5 bg-primary text-dark-900 px-8 py-4 rounded-2xl text-base font-black shadow-xl shadow-primary/30 hover:bg-cyan-400 transition"
                >
                  Enter Arena <ArrowRight size={19} />
                </Link>
              </motion.div>
            ) : (
              <>
                <motion.div whileHover={prefersReducedMotion ? {} : { scale: 1.05 }} whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}>
                  <button
                    onClick={handleGetStarted}
                    className="inline-flex items-center gap-2.5 bg-primary text-dark-900 px-8 py-4 rounded-2xl text-base font-black shadow-xl shadow-primary/30 hover:bg-cyan-400 transition"
                  >
                    Get Started <ArrowRight size={19} />
                  </button>
                </motion.div>
                <motion.div whileHover={prefersReducedMotion ? {} : { scale: 1.04 }} whileTap={prefersReducedMotion ? {} : { scale: 0.96 }}>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 border border-dark-600 text-gray-300 px-8 py-4 rounded-2xl text-base font-bold hover:border-primary/40 hover:text-primary transition"
                  >
                    Sign in <ChevronRight size={17} />
                  </Link>
                </motion.div>
              </>
            )}
          </motion.div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <StatPill value="100+" label="Matches Played" delay={0.55} />
            <StatPill value="3 Modes" label="Game Types" delay={0.62} />
            <StatPill value="AI Coach" label="Post-Match" delay={0.69} />
            <StatPill value="ELO" label="Rank System" delay={0.76} />
          </div>
        </motion.div>
      </section>

      {/* ── Features Bento Grid ───────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-primary font-bold mb-3">Why CodeQuest?</p>
          <h2 className="text-4xl md:text-5xl font-black text-white">
            Powerful <span className="text-primary">Features</span>
          </h2>
          <p className="text-gray-500 mt-3 max-w-md mx-auto text-sm">
            Everything you need to become a better competitive programmer.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={prefersReducedMotion ? {} : { y: -6, scale: 1.02 }}
                className={`relative group ${f.span} bg-dark-800/60 backdrop-blur border border-dark-600/60 rounded-2xl overflow-hidden cursor-default transition-shadow duration-300`}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 40px ${f.accent}18` }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none" }}
              >
                {/* Hover gradient overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at top left, ${f.accent}0c 0%, transparent 65%)` }}
                />
                <div className={`relative p-7 ${f.size === "large" ? "md:flex md:items-center md:gap-8" : ""}`}>
                  <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${f.size === "large" ? "md:mb-0" : ""}`}
                    style={{ background: `${f.accent}15`, border: `1px solid ${f.accent}30` }}>
                    <Icon size={28} style={{ color: f.accent }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white mb-2">{f.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────── */}
      <section className="relative max-w-4xl mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-primary font-bold mb-3">Simple Process</p>
          <h2 className="text-4xl font-black text-white">
            How It <span className="text-primary">Works</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "01", title: "Create Account", body: "Sign up in seconds and get your starter rating.", icon: <Code2 size={22} className="text-primary" /> },
            { step: "02", title: "Find a Match", body: "Jump into 1v1, 2v2, or Battle Royale instantly.", icon: <Zap size={22} className="text-purple-400" /> },
            { step: "03", title: "Climb the Ranks", body: "Win matches, earn XP, and claim your top spot.", icon: <Trophy size={22} className="text-yellow-400" /> },
          ].map((s, i) => (
            <motion.div key={s.step}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="relative bg-dark-800/50 border border-dark-600/50 rounded-2xl p-6 flex flex-col"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-black text-gray-600 tracking-widest">{s.step}</span>
                <div className="flex-1 h-px bg-dark-700" />
                <div className="w-9 h-9 rounded-lg bg-dark-700/80 border border-dark-600 flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <h3 className="text-base font-black text-white mb-2">{s.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed flex-1">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <section className="relative max-w-3xl mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.55 }}
          className="relative overflow-hidden rounded-3xl border border-dark-600/60 bg-dark-800/60 backdrop-blur p-10 md:p-14 text-center"
          style={{ boxShadow: "0 0 80px rgba(0,255,195,0.06)" }}
        >
          {/* BG glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-bold uppercase tracking-widest mb-6">
              <Star size={11} /> Ready to compete?
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Start your{" "}
              <span className="text-primary">CodeQuest</span>{" "}
              journey today
            </h2>
            <p className="text-gray-400 mb-8 max-w-sm mx-auto text-sm leading-relaxed">
              Challenge programmers worldwide and let the AI Tutor guide your next win.
            </p>
            <motion.button
              onClick={user ? () => navigate("/lobby") : handleGetStarted}
              whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              className="inline-flex items-center gap-2.5 bg-primary text-dark-900 px-8 py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/25 hover:bg-cyan-400 transition"
            >
              {user ? "Go to Lobby" : "Sign Up Now"} <ArrowRight size={17} />
            </motion.button>
          </div>
        </motion.div>
      </section>
    </div>
  )
}

export default Home
