"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import axios from "axios"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bot, Send, User, Plus, Zap, ChevronLeft, BarChart2,
  Trash2, ExternalLink, Lightbulb, BookOpen, Target
} from "lucide-react"
import { useAuth } from "../contexts/AuthContext"

// ── Constants ────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"

const createMsg = (role, content, extras = {}) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  ts: new Date().toISOString(),
  ...extras,
})

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""

// Suggested starter prompts (randomised each session)
const STARTERS = [
  { icon: <Lightbulb size={16} />, label: "Give me a hint for my last problem" },
  { icon: <Target size={16} />, label: "What are my weak topics?" },
  { icon: <BookOpen size={16} />, label: "Explain dynamic programming" },
  { icon: <BarChart2 size={16} />, label: "How can I improve my rating?" },
]

// ── Message bubble ───────────────────────────────────────────────
const Bubble = ({ msg }) => {
  const isUser = msg.role === "user"
  return (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-1 mr-3">
          <Bot size={16} className="text-primary" />
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isUser
            ? "bg-primary text-dark-900 font-medium rounded-br-sm"
            : msg.isError
              ? "bg-red-500/10 border border-red-500/30 text-red-300 rounded-bl-sm"
              : "bg-dark-700/80 border border-dark-600/60 text-gray-100 rounded-bl-sm"
          }`}>
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-600 mt-1 px-1">{fmtTime(msg.ts)}</span>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-dark-600 border border-dark-500 flex items-center justify-center flex-shrink-0 mt-1 ml-3">
          <User size={16} className="text-gray-300" />
        </div>
      )}
    </motion.div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────
const TypingDots = () => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    className="flex justify-start">
    <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0 mr-3">
      <Bot size={16} className="text-primary" />
    </div>
    <div className="bg-dark-700/80 border border-dark-600/60 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.div key={i} animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          className="w-2 h-2 bg-primary/60 rounded-full" />
      ))}
    </div>
  </motion.div>
)

// ── Main component ───────────────────────────────────────────────
const AITutor = () => {
  const { user, token } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const matchContext = location.state?.matchContext || JSON.parse(sessionStorage.getItem("cq_ai_match_context") || "null")

  const userId = useMemo(() => user?.id || user?._id, [user])

  // Build initial message — inject match context if available
  const buildWelcome = () => {
    if (matchContext?.questionTitle) {
      const outcome = matchContext.result === "win" ? "won ✅" : matchContext.result === "draw" ? "drew 🤝" : "lost ❌"
      return createMsg(
        "assistant",
        `Hey ${user?.username || "there"}! I've reviewed your match on **${matchContext.questionTitle}** where you ${outcome}.\n\n${matchContext.report
          ? matchContext.report + "\n\n"
          : ""
        }${matchContext.weakTopics?.length
          ? `Topics to focus on: ${matchContext.weakTopics.join(", ")}.\n\n`
          : ""
        }What would you like help with? I can explain the problem, suggest approaches, or help you practice similar challenges.`
      )
    }
    return createMsg(
      "assistant",
      `Hey ${user?.username || "there"}! 👋 I'm your CodeQuest AI Coach.\n\nAsk me anything — hints, strategy tips, code explanations, or a personalized study plan. I know your rating and match history, so I can tailor advice just for you.`
    )
  }

  const [messages, setMessages] = useState(() => [buildWelcome()])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [sessions, setSessions] = useState([{ id: "current", label: "Current Session", active: true }])
  const endRef = useRef(null)
  const textareaRef = useRef(null)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const sendMessage = async (text) => {
    const trimmed = (text || inputRef.current).trim()
    if (!trimmed || sending) return
    setInput("")
    setError("")

    const userMsg = createMsg("user", trimmed)
    const optimistic = [...messages, userMsg]
    setMessages(optimistic)
    setSending(true)

    try {
      const payload = optimistic.map(({ role, content }) => ({ role, content }))
      // Also pass match context to backend so it can personalise the system prompt
      const context = matchContext
        ? { performance: matchContext, matches: [] }
        : {}
      const res = await axios.post(
        `${API_URL}/api/ai-tutor/chat`,
        { userId, messages: payload, ...context },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const reply = res.data?.reply?.trim() || "Let me think about that — please try again."
      setMessages(prev => [...prev, createMsg("assistant", reply)])
    } catch (err) {
      const msg = err.response?.data?.error || "Something went wrong. Please try again."
      setMessages(prev => [...prev, createMsg("assistant", msg, { isError: true })])
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const clearChat = () => {
    setMessages([buildWelcome()])
    setError("")
  }

  const showStarters = messages.length === 1

  // ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] bg-dark-900 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r border-dark-700/60 bg-dark-800/50 flex flex-col p-3 hidden md:flex">
        {/* New chat */}
        <button
          onClick={clearChat}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border border-dark-600/60 text-gray-300 hover:bg-dark-700/60 hover:text-primary transition text-sm font-semibold mb-4"
        >
          <Plus size={15} /> New Chat
        </button>

        {/* Match context card */}
        {matchContext?.questionTitle && (
          <div className="mb-4 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-1.5 flex items-center gap-1.5">
              <BarChart2 size={10} /> Match Context
            </p>
            <p className="text-xs text-gray-300 font-semibold truncate">{matchContext.questionTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5 capitalize">
              {matchContext.result || "unknown"} ·{matchContext.attempts != null ? ` ${matchContext.attempts} attempt${matchContext.attempts !== 1 ? "s" : ""}` : ""}
              {matchContext.solveTimeSec != null ? ` · ${matchContext.solveTimeSec}s` : ""}
            </p>
          </div>
        )}

        {/* Session list */}
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sessions.map(s => (
            <button key={s.id} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition truncate ${s.active ? "bg-dark-700/80 text-gray-100 border border-dark-600" : "text-gray-500 hover:bg-dark-700/40 hover:text-gray-300"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-dark-700/60 space-y-1">
          <button onClick={clearChat}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition font-semibold">
            <Trash2 size={13} /> Clear Chat
          </button>
          <button onClick={() => navigate("/lobby")}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-200 hover:bg-dark-700/40 transition font-semibold">
            <ChevronLeft size={13} /> Back to Lobby
          </button>
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700/60 bg-dark-800/40 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Bot size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">CodeQuest AI Coach</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile clear */}
            <button onClick={clearChat} className="md:hidden flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-500/5">
              <Trash2 size={13} />
            </button>
            {matchContext && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary font-bold uppercase tracking-wider">
                <Zap size={10} /> {matchContext.result || "context"} loaded
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
          </AnimatePresence>

          {sending && <TypingDots />}

          {/* Starter suggestions — only when chat is fresh */}
          {showStarters && !sending && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
              {STARTERS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s.label)}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-dark-600/60 bg-dark-800/50 text-left text-sm text-gray-400 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition group">
                  <span className="text-primary/50 group-hover:text-primary transition">{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </motion.div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-dark-700/60 bg-dark-800/40 backdrop-blur px-4 py-4">
          {error && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
              {error}
            </motion.p>
          )}
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder="Ask anything… (Shift+Enter for new line)"
                rows={1}
                className="w-full bg-dark-900/80 border border-dark-600 focus:border-primary/60 focus:ring-1 focus:ring-primary/30 rounded-2xl px-4 py-3 pr-12 text-gray-100 text-sm placeholder-gray-600 resize-none transition outline-none overflow-hidden"
                style={{ minHeight: "48px", maxHeight: "160px" }}
              />
            </div>
            <motion.button
              type="button"
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-2xl bg-primary text-dark-900 flex items-center justify-center shadow-lg shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-400 transition flex-shrink-0"
            >
              {sending
                ? <div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />
                : <Send size={18} />}
            </motion.button>
          </div>
          <p className="text-center text-[10px] text-gray-600 mt-2">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  )
}

export default AITutor
