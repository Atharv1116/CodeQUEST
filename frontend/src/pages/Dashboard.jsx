"use client"

import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import axios from "axios"
import { motion } from "framer-motion"
import { Trophy, TrendingUp, Target, Award, Zap } from "lucide-react"
import { Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts"
import { staggerContainerVariants, staggerItemVariants } from "../utils/animations"

const SkeletonBlock = ({ className }) => <div className={`animate-pulse rounded-2xl bg-dark-800/60 ${className}`} />

const StatCard = ({ icon: Icon, label, value, delay = 0 }) => (
  <motion.div
    variants={staggerItemVariants}
    whileHover={{ scale: 1.05, y: -4 }}
    className="glass p-6 rounded-2xl group cursor-pointer hover:glow transition"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm font-medium">{label}</p>
        <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-3xl font-bold text-primary mt-2">
          {value}
        </motion.p>
      </div>
      <motion.div
        whileHover={{ scale: 1.1, rotate: 5 }}
        className="text-primary/40 group-hover:text-primary transition"
      >
        <Icon size={48} />
      </motion.div>
    </div>
  </motion.div>
)

const Dashboard = () => {
  const { user, token } = useAuth()
  const [stats, setStats] = useState(null)
  const [matchHistory, setMatchHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    fetchMatchHistory()
  }, [user])

  const fetchStats = async () => {
    try {
      const userId = user.id || user._id
      const response = await axios.get(`/api/user/${userId}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setStats(response.data)
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMatchHistory = async () => {
    try {
      const userId = user.id || user._id
      const response = await axios.get(`/api/user/${userId}/matches`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setMatchHistory(response.data)
    } catch (error) {
      console.error("Failed to fetch match history:", error)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 space-y-6">
        <SkeletonBlock className="h-16" />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32" />
          ))}
        </div>
        <SkeletonBlock className="h-64" />
      </div>
    )
  }

  const skillData = stats
    ? [
      { skill: "Algorithms", value: stats.skills?.algorithms || 0 },
      { skill: "Data Structures", value: stats.skills?.dataStructures || 0 },
      { skill: "Debugging", value: stats.skills?.debugging || 0 },
      { skill: "Speed", value: stats.skills?.speed || 0 },
    ]
    : []

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-bold mb-4 text-gradient text-balance"
          >
            Your Dashboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400 text-lg"
          >
            Track your progress, master new skills, and climb the leaderboard.
          </motion.p>
        </div>

        {/* Stats Grid */}
        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="show"
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          <StatCard icon={Trophy} label="Rating" value={stats?.rating || 1000} delay={0} />
          <StatCard icon={TrendingUp} label="Level" value={stats?.level || 1} delay={0.1} />
          <StatCard icon={Target} label="Wins" value={stats?.wins || 0} delay={0.2} />
          <StatCard icon={Zap} label="Streak" value={stats?.streak || 0} delay={0.3} />
        </motion.div>

        {/* Charts Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Skill Radar */}
          <motion.div
            variants={staggerItemVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass p-6 rounded-2xl"
          >
            <h3 className="text-2xl font-bold mb-6 text-gradient">Skill Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={skillData}>
                <PolarGrid strokeDasharray="3 3" stroke="#333" />
                <PolarAngleAxis dataKey="skill" stroke="#999" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#666" />
                <Radar name="Skills" dataKey="value" stroke="#00ffc3" fill="#00ffc3" fillOpacity={0.6} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Win/Loss Stats */}
          <motion.div
            variants={staggerItemVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass p-6 rounded-2xl space-y-6"
          >
            <div>
              <h3 className="text-2xl font-bold mb-6 text-gradient">Performance</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-dark-700/50 p-4 rounded-xl text-center">
                  <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-3xl font-bold text-success">
                    {stats?.wins || 0}
                  </motion.p>
                  <p className="text-sm text-gray-400 mt-2">Wins</p>
                </div>
                <div className="bg-dark-700/50 p-4 rounded-xl text-center">
                  <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-3xl font-bold text-danger">
                    {stats?.losses || 0}
                  </motion.p>
                  <p className="text-sm text-gray-400 mt-2">Losses</p>
                </div>
                <div className="bg-dark-700/50 p-4 rounded-xl text-center">
                  <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-3xl font-bold text-primary">
                    {stats?.matches || 0}
                  </motion.p>
                  <p className="text-sm text-gray-400 mt-2">Total</p>
                </div>
              </div>
            </div>

            <div className="border-t border-dark-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Best Streak</p>
                  <motion.p initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-2xl font-bold text-primary">
                    {stats?.longestStreak || 0}
                  </motion.p>
                </div>
                <Zap className="text-primary/40" size={48} />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Recent Matches */}
        <motion.div
          variants={staggerItemVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="glass p-6 rounded-2xl"
        >
          <h3 className="text-2xl font-bold mb-6 text-gradient">Recent Matches</h3>
          <div className="space-y-3">
            {matchHistory.slice(0, 10).map((match, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-dark-700 p-4 rounded-xl flex justify-between items-center hover:bg-dark-600/80 transition"
              >
                <div>
                  <p className="font-semibold text-gray-100">{match.question?.title || "Unknown Problem"}</p>
                  <p className="text-sm text-gray-500">{new Date(match.timestamp).toLocaleString()}</p>
                </div>
                <motion.span
                  whileHover={{ scale: 1.1 }}
                  className={`px-4 py-2 rounded-lg font-bold ${match.winner === user.id ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                    }`}
                >
                  {match.winner === user.id ? "Win" : "Loss"}
                </motion.span>
              </motion.div>
            ))}
            {matchHistory.length === 0 && (
              <p className="text-gray-400 text-center py-8">No matches yet. Start playing!</p>
            )}
          </div>
        </motion.div>

        {/* Badges Section */}
        {stats?.badges && stats.badges.length > 0 && (
          <motion.div
            variants={staggerItemVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass p-6 rounded-2xl mt-8"
          >
            <h3 className="text-2xl font-bold mb-6 text-gradient flex items-center gap-2">
              <Award size={28} />
              Achievements
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {stats.badges.map((badge, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  viewport={{ once: true }}
                  className="bg-gradient-to-br from-primary/20 to-secondary/10 border border-primary/40 p-4 rounded-xl text-center"
                >
                  <div className="text-2xl mb-2">⭐</div>
                  <span className="text-xs font-semibold text-primary text-balance">{badge}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

export default Dashboard
