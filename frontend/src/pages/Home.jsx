"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { motion } from "framer-motion"
import { Trophy, Users, Zap, Brain, ArrowRight } from "lucide-react"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"
import { staggerContainerVariants, staggerItemVariants, ANIMATION_TIMING } from "../utils/animations"

const AnimatedBlob = ({ delay = 0 }) => (
  <motion.div
    animate={{
      scale: [1, 1.1, 0.9, 1],
      rotate: [0, 90, 180, 360],
    }}
    transition={{
      duration: 20,
      delay,
      repeat: Number.POSITIVE_INFINITY,
      ease: "linear",
    }}
    className="absolute rounded-full mix-blend-multiply filter blur-3xl opacity-20"
  />
)

const Home = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [ctaAnimating, setCtaAnimating] = useState(false)

  const handleGetStarted = () => {
    if (!prefersReducedMotion) {
      setCtaAnimating(true)
      setTimeout(() => navigate("/register"), ANIMATION_TIMING.base)
    } else {
      navigate("/register")
    }
  }

  const features = [
    {
      icon: Users,
      title: "Multiplayer Battles",
      description: "Compete in 1v1 duels, 2v2 team battles, or Battle Royale tournaments.",
    },
    {
      icon: Brain,
      title: "AI Tutor Coach",
      description: "Get personalized feedback, hints, and skill recommendations from AI.",
    },
    {
      icon: Trophy,
      title: "Gamification",
      description: "Earn XP, coins, badges, and climb the ELO-based leaderboard.",
    },
    {
      icon: Zap,
      title: "Real-Time Features",
      description: "Live code editor, instant matchmaking, and real-time leaderboards.",
    },
  ]

  return (
    <div className="min-h-screen overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <AnimatedBlob delay={0} className="w-72 h-72 bg-primary top-10 left-10" />
        <AnimatedBlob delay={5} className="w-96 h-96 bg-secondary bottom-20 right-5" />
        <AnimatedBlob delay={10} className="w-64 h-64 bg-accent top-1/2 right-1/3" />
      </div>

      {/* Hero Section */}
      <section className="relative container mx-auto px-4 py-20 md:py-32 text-center">
        <motion.div
          variants={{
            initial: { opacity: 0, y: 24, scale: 0.96 },
            animate: { opacity: 1, y: 0, scale: 1 },
            exit: { opacity: 0, y: -24, scale: 0.98 },
          }}
          initial="initial"
          animate={ctaAnimating ? "exit" : "animate"}
          transition={{ duration: ANIMATION_TIMING.base / 1000, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-xs uppercase tracking-[0.35em] text-primary mb-4"
          >
            Welcome to the arena
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-5xl md:text-7xl font-bold mb-6 text-gradient text-balance"
          >
            CodeQuest
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-xl md:text-2xl text-gray-300 mb-8 text-balance max-w-3xl mx-auto"
          >
            Master competitive programming through real-time battles, AI-powered coaching, and gamified learning.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-gray-400 max-w-2xl mx-auto mb-12 text-lg"
          >
            Challenge yourself in 1v1 duels, team battles, or multi-player tournaments. Track your skills, unlock
            badges, and climb the global leaderboard.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {user ? (
              <motion.div
                whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              >
                <Link
                  to="/lobby"
                  className="inline-flex items-center gap-2 bg-primary text-dark-900 px-8 py-4 rounded-xl text-lg font-semibold shadow-lg shadow-primary/30 hover:bg-cyan-400 transition focus-ring"
                >
                  Enter Arena <ArrowRight size={20} />
                </Link>
              </motion.div>
            ) : (
              <>
                <motion.div
                  whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                >
                  <button
                    onClick={handleGetStarted}
                    className="inline-flex items-center gap-2 bg-primary text-dark-900 px-8 py-4 rounded-xl text-lg font-semibold shadow-lg shadow-primary/30 hover:bg-cyan-400 transition focus-ring"
                  >
                    Get Started <ArrowRight size={20} />
                  </button>
                </motion.div>
                <motion.div
                  whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                >
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 border-2 border-primary text-primary px-8 py-4 rounded-xl text-lg font-semibold hover:bg-primary/10 transition focus-ring"
                  >
                    Login
                  </Link>
                </motion.div>
              </>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="relative container mx-auto px-4 py-20">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-bold text-center mb-16 text-gradient text-balance"
        >
          Powerful Features
        </motion.h2>

        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={staggerItemVariants}
                whileHover={prefersReducedMotion ? {} : { scale: 1.05, y: -8 }}
                className="glass-card p-8 rounded-2xl group cursor-pointer hover:neon-border transition duration-300"
              >
                <motion.div
                  initial={{ scale: 1 }}
                  whileHover={prefersReducedMotion ? {} : { scale: 1.1, rotate: 5 }}
                  className="mb-4"
                >
                  <Icon className="text-primary group-hover:text-cyan-400 transition" size={48} />
                </motion.div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="relative container mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card p-12 rounded-3xl max-w-2xl mx-auto neon-border"
        >
          <h2 className="text-3xl font-bold mb-4 text-gradient">Ready to compete?</h2>
          <p className="text-gray-400 mb-8">Start your CodeQuest journey today and challenge programmers worldwide.</p>
          <motion.button
            whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
            onClick={handleGetStarted}
            className="bg-primary text-dark-900 px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/30 hover:bg-cyan-400 transition"
          >
            {user ? "Go to Lobby" : "Sign Up Now"}
          </motion.button>
        </motion.div>
      </section>
    </div>
  )
}

export default Home
