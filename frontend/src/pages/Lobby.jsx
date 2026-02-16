"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { useSocket } from "../contexts/SocketContext"
import { useAuth } from "../contexts/AuthContext"
import { motion } from "framer-motion"
import { Users, Zap } from "lucide-react"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"

const Lobby = () => {
  const [queueStatus, setQueueStatus] = useState({ mode: null, size: 0 })
  const [searching, setSearching] = useState(false)
  const [matchOverlay, setMatchOverlay] = useState(null)
  const [countdown, setCountdown] = useState(5)
  const [overlayMessage, setOverlayMessage] = useState("")
  const [leaveModal, setLeaveModal] = useState({ open: false, nextPath: null })
  const prefersReducedMotion = usePrefersReducedMotion()
  const countdownRef = useRef(null)
  const leaveConfirmRef = useRef(null)
  const socket = useSocket()
  const navigate = useNavigate()
  const { user, token } = useAuth()

  const guardActive = useMemo(() => searching || Boolean(matchOverlay), [searching, matchOverlay])

  useEffect(() => {
    if (!socket) return

    socket.on("queued", (data) => {
      console.log('[Lobby] Received queued event:', data);

      // Use setTimeout to defer state updates and avoid setState during render
      setTimeout(() => {
        setQueueStatus({
          mode: data.mode,
          size: data.queueSize,
          position: data.position,
          team: data.team,
          teamStatus: data.teamStatus,
          teamBlueSize: data.teamBlueSize,
          teamRedSize: data.teamRedSize
        });
        setSearching(true);
      }, 0);
    });

    socket.on("match-found", (data) => {
      console.log('[Lobby] Received match-found:', data);
      console.debug("match_found", data);

      // Use setTimeout to defer state updates and avoid setState during render
      setTimeout(() => {
        setSearching(false);
        setMatchOverlay({
          ...data,
          questionTitle: data.question?.title || "Mystery Problem",
          questionDifficulty: data.question?.difficulty || "???",
        });
      }, 0);
    });

    socket.on("match-finished", (payload) => {
      if (!matchOverlay) return
      if (payload.roomId === matchOverlay.roomId && payload.reason === "opponent-disconnected") {
        setOverlayMessage("Opponent disconnected, returning you to the queue.")
        setMatchOverlay(null)
        setSearching(false)
        setTimeout(() => setOverlayMessage(""), 3000)
      }
    })

    return () => {
      socket.off("queued")
      socket.off("match-found")
      socket.off("match-finished")
    }
  }, [socket, matchOverlay])

  useEffect(() => {
    if (!matchOverlay) {
      clearInterval(countdownRef.current)
      return undefined
    }

    setCountdown(5)
    console.debug("countdown_started", { roomId: matchOverlay.roomId })
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          finalizeCountdown("auto")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownRef.current)
  }, [matchOverlay])

  useEffect(() => {
    window.__codequestLobbyGuard = { active: guardActive }
  }, [guardActive])

  useEffect(() => {
    if (!guardActive) return undefined
    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [guardActive])

  useEffect(() => {
    const handleGuardRequest = (event) => {
      if (!guardActive) return
      event.preventDefault?.()
      setLeaveModal({ open: true, nextPath: event.detail?.nextPath || "/" })
    }
    window.addEventListener("lobby-leave-request", handleGuardRequest)
    return () => window.removeEventListener("lobby-leave-request", handleGuardRequest)
  }, [guardActive])

  useEffect(() => {
    if (!leaveModal.open) return undefined
    leaveConfirmRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeLeaveModal()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [leaveModal.open])

  const finalizeCountdown = (reason) => {
    if (!matchOverlay) return
    console.debug("countdown_finished", { roomId: matchOverlay.roomId, reason })
    clearInterval(countdownRef.current)
    const destination =
      matchOverlay.type === "battle-royale" ? `/battle-royale/${matchOverlay.roomId}` : `/battle/${matchOverlay.roomId}`
    setMatchOverlay(null)
    navigate(destination)
  }

  const joinGame = (mode) => {
    if (!socket) {
      console.error('[Lobby] No socket connection!');
      return;
    }
    console.log(`[Lobby] Joining ${mode} queue`);
    setSearching(true);
    setQueueStatus({ mode, size: 0 });

    if (mode === "1v1") {
      socket.emit("join-1v1");
      console.log('[Lobby] Emitted join-1v1');
    } else if (mode === "2v2") {
      socket.emit("join-2v2");
      console.log('[Lobby] Emitted join-2v2');
    } else if (mode === "battle-royale") {
      socket.emit("join-battle-royale");
      console.log('[Lobby] Emitted join-battle-royale');
    }
  }

  const cancelSearch = () => {
    setSearching(false)
    setQueueStatus({ mode: null, size: 0 })
  }

  const handleReadyNow = () => finalizeCountdown("ready-button")

  const handleCancelMatch = () => {
    setMatchOverlay(null)
    setOverlayMessage("Match cancelled. Rejoining lobby...")
    setTimeout(() => setOverlayMessage(""), 2500)
  }

  const handleLeaveConfirm = async () => {
    try {
      if (matchOverlay && token) {
        console.debug("forfeit_requested", { roomId: matchOverlay.roomId })
        await axios.post(
          `/api/match/${matchOverlay.roomId}/forfeit`,
          { reason: "user-request" },
          { headers: { Authorization: `Bearer ${token}` } },
        )
        socket?.emit("player_left_match", {
          roomId: matchOverlay.roomId,
          userId: user?.id || user?._id,
          reason: "forfeit",
        })
      }
    } catch (error) {
      console.error("Failed to forfeit match:", error)
    } finally {
      setMatchOverlay(null)
      setSearching(false)
      setQueueStatus({ mode: null, size: 0 })
      setLeaveModal({ open: false, nextPath: null })
      navigate(leaveModal.nextPath || "/dashboard")
    }
  }

  const closeLeaveModal = () => setLeaveModal({ open: false, nextPath: null })

  const countdownProgress = useMemo(() => (countdown / 5) * 100, [countdown])

  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 text-gradient">Battle Arena</h1>
        <p className="text-xl text-gray-400">Choose your battle mode</p>
      </motion.div>

      {searching && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        >
          <div className="glass p-8 rounded-lg text-center">
            <div className="matchmaking-spinner mx-auto mb-4" role="status" aria-live="polite">
              <span className="matchmaking-spinner__track" />
              <span className="matchmaking-spinner__indicator" />
            </div>
            <p className="text-xl text-primary mb-2">Searching for players...</p>
            <p className="text-gray-400">
              {queueStatus.mode === "1v1" && "Looking for 1 more player"}
              {queueStatus.mode === "2v2" && (
                <>
                  {queueStatus.teamStatus === "complete" ? (
                    `Team ${queueStatus.team === "blue" ? "Blue" : "Red"} complete! Waiting for opponent team...`
                  ) : (
                    `Position ${queueStatus.position || queueStatus.size}/4 - Team ${queueStatus.team === "blue" ? "Blue" : "Red"} (${queueStatus.team === "blue" ? queueStatus.teamBlueSize : queueStatus.teamRedSize}/2)`
                  )}
                </>
              )}
              {queueStatus.mode === "battle-royale" && `Queue: ${queueStatus.size} players`}
            </p>
            <button onClick={cancelSearch} className="mt-4 text-gray-400 hover:text-primary transition">
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {matchOverlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4"
        >
          <motion.div
            initial={{ scale: prefersReducedMotion ? 1 : 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="glass max-w-2xl w-full rounded-3xl p-10 text-center space-y-8 shadow-glass"
          >
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">Match Found</p>
              <motion.h2
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-5xl font-bold text-gradient mt-4"
              >
                Opponent Ready!
              </motion.h2>
            </motion.div>

            {/* Problem Info */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-dark-700/50 border border-primary/30 rounded-2xl p-6"
            >
              <p className="text-gray-300 text-lg font-semibold mb-2">{matchOverlay.questionTitle}</p>
              <div className="flex items-center justify-center gap-3">
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${matchOverlay.questionDifficulty === "easy"
                    ? "bg-success/20 text-success"
                    : matchOverlay.questionDifficulty === "medium"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-danger/20 text-danger"
                    }`}
                >
                  {matchOverlay.questionDifficulty.toUpperCase()}
                </span>
              </div>
            </motion.div>

            {/* Players Section */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-center gap-6"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                className="text-right flex-1"
              >
                <p className="text-xl font-bold text-gray-200">{user?.username || "You"}</p>
                <p className="text-sm text-gray-500">Rating {user?.rating || 1000}</p>
              </motion.div>
              <p className="text-gray-500 text-2xl font-light">vs</p>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                className="text-left flex-1"
              >
                <p className="text-xl font-bold text-gray-200">Mystery Rival</p>
                <p className="text-sm text-gray-500">Skill-Matched</p>
              </motion.div>
            </motion.div>

            {/* Enhanced Countdown Circle */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center justify-center"
            >
              <div className="relative h-40 w-40">
                {/* Animated background ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary opacity-30"
                  aria-hidden="true"
                />

                {/* Progress ring */}
                <svg className="absolute inset-0 transform -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="76" fill="none" stroke="#333" strokeWidth="2" />
                  <motion.circle
                    cx="80"
                    cy="80"
                    r="76"
                    fill="none"
                    stroke="#00ffc3"
                    strokeWidth="2"
                    strokeDasharray={2 * Math.PI * 76}
                    initial={{ strokeDashoffset: 2 * Math.PI * 76 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 5, ease: "linear" }}
                  />
                </svg>

                {/* Inner circle with countdown */}
                <div className="absolute inset-2 rounded-full bg-dark-900 flex items-center justify-center">
                  <motion.span
                    key={countdown}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-5xl font-bold text-primary"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {countdown}
                  </motion.span>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-4 justify-center flex-wrap"
            >
              <motion.button
                onClick={handleCancelMatch}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-xl border-2 border-danger text-danger hover:bg-danger/10 font-semibold transition"
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={handleReadyNow}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 rounded-xl bg-primary text-dark-900 font-bold shadow-lg shadow-primary/40 hover:bg-cyan-400 transition"
              >
                Ready
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {overlayMessage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-dark-800 text-gray-100 px-4 py-2 rounded-full shadow-lg"
        >
          {overlayMessage}
        </motion.div>
      )}

      {leaveModal.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-modal-title"
        >
          <motion.div
            initial={{ scale: prefersReducedMotion ? 1 : 0.95 }}
            animate={{ scale: 1 }}
            className="glass w-full max-w-md rounded-2xl p-6 space-y-4"
          >
            <h3 id="leave-modal-title" className="text-2xl font-bold text-gradient">
              Leave Match?
            </h3>
            <p className="text-gray-300">
              Are you sure you want to leave this match? You will lose the match and the opponent will earn the win.
            </p>
            <div className="flex gap-3 flex-wrap justify-end">
              <button
                onClick={closeLeaveModal}
                className="px-4 py-2 rounded-xl border border-gray-500 text-gray-200 hover:bg-dark-700 transition"
              >
                No — Stay
              </button>
              <button
                ref={leaveConfirmRef}
                onClick={handleLeaveConfirm}
                className="px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-400 transition"
              >
                Yes — Leave
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {/* 1v1 Mode */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="glass p-8 rounded-lg text-center cursor-pointer hover:glow transition"
          onClick={() => joinGame("1v1")}
        >
          <Users className="text-primary mx-auto mb-4" size={60} />
          <h2 className="text-2xl font-bold mb-2">1v1 Duel</h2>
          <p className="text-gray-400 mb-4">Face off against one opponent</p>
          <button className="bg-primary text-dark-900 px-6 py-2 rounded-lg font-semibold hover:bg-cyan-400 transition">
            Join Queue
          </button>
        </motion.div>

        {/* 2v2 Mode */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="glass p-8 rounded-lg text-center cursor-pointer hover:glow transition"
          onClick={() => joinGame("2v2")}
        >
          <Users className="text-primary mx-auto mb-4" size={60} />
          <h2 className="text-2xl font-bold mb-2">2v2 Team Battle</h2>
          <p className="text-gray-400 mb-4">Team up and compete</p>
          <button className="bg-primary text-dark-900 px-6 py-2 rounded-lg font-semibold hover:bg-cyan-400 transition">
            Join Queue
          </button>
        </motion.div>

        {/* Battle Royale Mode */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="glass p-8 rounded-lg text-center cursor-pointer hover:glow transition border-2 border-primary"
          onClick={() => navigate("/battle-royale-mode")}
        >
          <Zap className="text-primary mx-auto mb-4" size={60} />
          <h2 className="text-2xl font-bold mb-2">Battle Royale</h2>
          <p className="text-gray-400 mb-4">Last coder standing wins!</p>
          <button className="bg-primary text-dark-900 px-6 py-2 rounded-lg font-semibold hover:bg-cyan-400 transition">
            Enter Battle
          </button>
        </motion.div>
      </div>

      {/* Quick Stats */}
      {user && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 glass p-6 rounded-lg max-w-2xl mx-auto"
        >
          <h3 className="text-xl font-semibold mb-4 text-center">Your Stats</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{user.rating}</p>
              <p className="text-sm text-gray-400">Rating</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{user.level}</p>
              <p className="text-sm text-gray-400">Level</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{user.wins}</p>
              <p className="text-sm text-gray-400">Wins</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{user.streak}</p>
              <p className="text-sm text-gray-400">Streak</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default Lobby
