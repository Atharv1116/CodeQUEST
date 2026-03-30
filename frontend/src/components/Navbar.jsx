"use client"

import { Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { Trophy, User, LogOut, Home, Brain } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"
import { useState } from "react"

const Navbar = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const isInBattle = location.pathname.includes("/battle/") || location.pathname.includes("/battle-royale/")
  const guardActive = location.pathname === "/lobby" && window?.__codequestLobbyGuard?.active
  const battleGuardActive =
    isInBattle && (typeof window !== "undefined" ? window.__codequestBattleGuard?.active : false)

  const requestLobbyLeave = (nextPath) => {
    window.dispatchEvent(new CustomEvent("lobby-leave-request", { detail: { nextPath } }))
  }

  const requestBattleLeave = (nextPath) => {
    window.dispatchEvent(new CustomEvent("request-leave-match", { detail: { nextPath } }))
  }

  const handleGuardedNav = (event, targetPath) => {
    if (battleGuardActive && targetPath && targetPath !== location.pathname) {
      event.preventDefault()
      requestBattleLeave(targetPath)
      return true
    }
    if (guardActive && targetPath !== "/lobby") {
      event.preventDefault()
      requestLobbyLeave(targetPath)
      return true
    }
    return false
  }

  const handleLogout = (event) => {
    if (handleGuardedNav(event, "/")) {
      return
    }
    logout()
    navigate("/")
  }

  const navLinks = [
    { label: "Lobby", icon: Home, href: "/lobby" },
    { label: "Leaderboard", icon: Trophy, href: "/leaderboard" },
    { label: "AI Tutor", icon: Brain, href: "/ai-tutor", tooltip: "CodeQuest AI Coach" },
  ]

  return (
    <nav className="bg-dark-900/80 backdrop-blur-md border-b border-dark-700/50 sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/" onClick={(event) => handleGuardedNav(event, "/")} className="flex items-center gap-2 group">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                className="text-2xl"
              >
                ⚔️
              </motion.div>
              <span className="text-xl font-bold text-gradient hidden sm:inline">CodeQuest</span>
            </Link>
          </motion.div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {user ? (
              <>
                {navLinks.map((link) => {
                  const Icon = link.icon
                  const isActive = location.pathname.startsWith(link.href)
                  return (
                    <motion.div key={link.href} className="relative group">
                      <Link
                        to={link.href}
                        onClick={(event) => {
                          link.onClick?.(event)
                          if (event.defaultPrevented) return
                          handleGuardedNav(event, link.href)
                        }}
                        className={`flex items-center gap-2 font-medium transition ${
                          isActive ? "text-primary" : "text-gray-300 hover:text-primary"
                        }`}
                      >
                        <Icon size={18} />
                        <span>{link.label}</span>
                      </Link>
                      {!prefersReducedMotion && isActive && (
                        <motion.span
                          layoutId="nav-indicator"
                          className="absolute -bottom-3 left-0 w-full h-0.5 bg-primary rounded-full"
                        />
                      )}
                      {link.tooltip && (
                        <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 scale-0 rounded-lg bg-dark-800 px-3 py-1.5 text-xs text-gray-300 shadow-xl transition duration-150 group-hover:scale-100 whitespace-nowrap">
                          {link.tooltip}
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </>
            ) : null}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {user ? (
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-dark-700/50 transition"
                >
                  <User size={18} className="text-primary" />
                  <span className="hidden sm:inline text-sm font-medium text-gray-300">{user.username}</span>
                </motion.button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      className="absolute top-full right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-lg overflow-hidden"
                    >
                      <Link
                        to="/dashboard"
                        onClick={(event) => {
                          handleGuardedNav(event, "/dashboard")
                          setShowUserMenu(false)
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50 transition text-gray-300 hover:text-primary"
                      >
                        <User size={18} />
                        <span>Dashboard</span>
                      </Link>
                      <div className="border-t border-dark-700" />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-danger/10 transition text-gray-300 hover:text-danger"
                      >
                        <LogOut size={18} />
                        <span>Logout</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link to="/login" className="text-gray-300 hover:text-primary font-medium transition">
                    Login
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    to="/register"
                    className="bg-primary text-dark-900 px-4 py-2 rounded-lg font-semibold hover:bg-cyan-400 transition shadow-lg shadow-primary/30"
                  >
                    Sign Up
                  </Link>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
