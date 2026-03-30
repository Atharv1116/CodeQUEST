"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import { motion } from "framer-motion"
import { Trophy, Medal, Award, TrendingUp } from "lucide-react"
import { staggerContainerVariants, staggerItemVariants } from "../utils/animations"

const API_URL = import.meta.env.VITE_API_URL;

const PlaceholderRow = () => (
  <div className="animate-pulse p-4 rounded-lg bg-dark-800/60 flex justify-between items-center">
    <div className="h-6 bg-dark-600 rounded w-32" />
    <div className="h-6 bg-dark-600 rounded w-24" />
  </div>
)

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([])
  const [type, setType] = useState("global")
  const [college, setCollege] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard()
  }, [type, college])

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${API_URL}/api/leaderboard`, {
        params: { type, college },
      })
      const data = response.data;
      if (Array.isArray(data)) {
        setLeaderboard(data);
      } else {
        console.warn("Leaderboard API returned non-array:", data);
        setLeaderboard([]);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error)
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="text-yellow-400" size={24} />
    if (rank === 2) return <Medal className="text-gray-300" size={24} />
    if (rank === 3) return <Award className="text-orange-400" size={24} />
    return <span className="text-gray-400 font-bold">#{rank}</span>
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="text-primary" size={40} />
            <h1 className="text-5xl font-bold text-gradient">Leaderboard</h1>
          </div>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Compete globally or within your college. Climb the ranks and earn bragging rights.
          </p>
        </motion.div>

        {/* Filter Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-6 rounded-2xl mb-8 max-w-2xl mx-auto"
        >
          <div className="flex flex-wrap gap-4 justify-center items-center">
            <button
              onClick={() => setType("global")}
              className={`px-6 py-3 rounded-xl font-semibold transition ${type === "global"
                ? "bg-primary text-dark-900 shadow-lg shadow-primary/30"
                : "bg-dark-700 text-gray-300 hover:bg-dark-600"
                }`}
            >
              Global
            </button>
            <button
              onClick={() => setType("college")}
              className={`px-6 py-3 rounded-xl font-semibold transition ${type === "college"
                ? "bg-primary text-dark-900 shadow-lg shadow-primary/30"
                : "bg-dark-700 text-gray-300 hover:bg-dark-600"
                }`}
            >
              College
            </button>
            {type === "college" && (
              <motion.input
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                type="text"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                placeholder="Enter college name"
                className="bg-dark-700 border border-primary/30 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
              />
            )}
          </div>
        </motion.div>

        {/* Leaderboard Table */}
        {loading ? (
          <div className="glass p-6 rounded-2xl max-w-4xl mx-auto space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <PlaceholderRow key={idx} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            animate="show"
            className="glass p-6 rounded-2xl max-w-4xl mx-auto"
          >
            <div className="space-y-2">
              {leaderboard.map((player, idx) => (
                <motion.div
                  key={player._id || idx}
                  variants={staggerItemVariants}
                  whileHover={{ scale: 1.01, x: 4 }}
                  className={`p-4 rounded-xl flex items-center justify-between transition cursor-pointer ${idx < 3
                    ? "bg-gradient-to-r from-primary/20 to-transparent border-2 border-primary/50"
                    : "bg-dark-700 hover:bg-dark-600"
                    }`}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="w-12 text-center">{getRankIcon(idx + 1)}</div>
                    <div>
                      <p className="font-bold text-lg text-gray-100">{player.username}</p>
                      {player.college && <p className="text-sm text-gray-500">{player.college}</p>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <motion.p
                        key={`${player._id || idx}-${player.rating}`}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="text-primary font-bold text-xl"
                      >
                        {player.rating}
                      </motion.p>
                      <p className="text-xs text-gray-400">Rating</p>
                    </div>
                    <div className="text-right">
                      <p className="text-primary font-bold text-lg">{player.wins}</p>
                      <p className="text-xs text-gray-400">Wins</p>
                    </div>
                    <div className="text-right">
                      <p className="text-primary font-bold text-lg">Lv.{player.level || 1}</p>
                      <p className="text-xs text-gray-400">Level</p>
                    </div>
                  </div>
                </motion.div>
              ))}
              {leaderboard.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-gray-400 py-12 text-lg"
                >
                  No players found. Be the first!
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

export default Leaderboard
