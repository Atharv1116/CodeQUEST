"use client"

import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Phone, ShieldCheck, Brain, Zap, KeyRound } from "lucide-react"
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion"
import { staggerContainerVariants, staggerItemVariants } from "../utils/animations"

const featureCards = [
  {
    title: "AI Warmups",
    body: "Get personalized hints before every match to enter with confidence.",
    icon: <Brain className="text-primary w-6 h-6" />,
  },
  {
    title: "Instant Matchmaking",
    body: "Real-time queues pair you with rivals at your exact skill level in seconds.",
    icon: <Zap className="text-secondary w-6 h-6" />,
  },
  {
    title: "Secure Mobile Auth",
    body: "Quick one-time passcode login, encrypted and expires in 2 minutes.",
    icon: <KeyRound className="text-cta w-6 h-6" />,
  },
]

const Login = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const prefersReducedMotion = usePrefersReducedMotion()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [authMethod, setAuthMethod] = useState("email")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)

  useEffect(() => {
    if (!otpSent || otpCountdown <= 0) return undefined
    const t = setInterval(() => setOtpCountdown((prev) => Math.max(prev - 1, 0)), 1000)
    return () => clearInterval(t)
  }, [otpSent, otpCountdown])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")

    if (authMethod === "otp") {
      if (otp.length < 4) {
        setError("Enter the 4-digit code we texted you.")
        return
      }
      setLoading(true)
      setTimeout(() => {
        setLoading(false)
        navigate("/register", { state: { phone } })
      }, 800)
      return
    }

    setLoading(true)
    const result = await login(email, password)
    if (result.success) {
      navigate("/lobby")
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  const handleGoogleLogin = () => {
    setError("")
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setError("Google login is rolling out soon. Use email or OTP for now.")
    }, 900)
  }

  const handleSendOtp = () => {
    if (!phone) {
      setError("Enter your mobile number first.")
      return
    }
    setError("")
    setOtpSent(true)
    setOtpCountdown(30)
  }

  const googleButton = useMemo(
    () => (
      <motion.button
        type="button"
        onClick={handleGoogleLogin}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 px-4 flex items-center justify-center gap-3 font-semibold hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 transition"
      >
        <svg width="20" height="20" viewBox="0 0 533.5 544.3" aria-hidden="true">
          <path
            fill="#4285f4"
            d="M533.5 278.4a320.1 320.1 0 00-4.7-55.6H272v105.2h146.9a125.7 125.7 0 01-54.5 82.4v68h87.9c51.5-47.4 80.2-117.3 80.2-200z"
          />
          <path
            fill="#34a853"
            d="M272 544.3c73.5 0 135.2-24.3 180.3-66.2l-87.9-68c-24.4 16.4-55.7 26-92.4 26-70.9 0-130.9-47.8-152.3-112.1H27.2v70.4c45.2 89.7 138.2 149.9 244.8 149.9z"
          />
          <path fill="#fbbc04" d="M119.7 323.9c-10.3-30.7-10.3-63.5 0-94.2V159.3H27.2a272 272 0 000 225.6z" />
          <path
            fill="#ea4335"
            d="M272 106.1c39.9-.6 78.2 14.6 107.2 42.4l80.1-80C409.5 24.2 342.5-.7 272 0 165.4 0 72.4 60.3 27.2 150l92.5 70.4C141.1 153 201.1 105.3 272 106.1z"
          />
        </svg>
        Continue with Google
      </motion.button>
    ),
    [prefersReducedMotion],
  )

  const mobileButton = (
    <motion.button
      type="button"
      onClick={() => setAuthMethod((prev) => (prev === "otp" ? "email" : "otp"))}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      className="w-full bg-primary/10 text-primary border border-primary/40 rounded-xl py-3 px-4 flex items-center justify-center gap-3 font-semibold hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 transition"
    >
      <Phone size={18} />
      {authMethod === "otp" ? "Use Email & Password" : "Login with Mobile OTP"}
    </motion.button>
  )

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="glass-dark p-8 rounded-3xl max-w-2xl w-full mx-auto shadow-glow-sm"
      >
        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          animate="show"
          className="text-center mb-8 space-y-3"
        >
          <motion.p variants={staggerItemVariants} className="text-xs uppercase tracking-[0.35em] text-primary">
            Welcome back
          </motion.p>
          <motion.h1 variants={staggerItemVariants} className="text-4xl font-heading text-gradient">
            Login to CodeQuest
          </motion.h1>
          <motion.p variants={staggerItemVariants} className="text-gray-400">
            Continue your climb, unlock achievements, and let the AI Tutor guide your next win.
          </motion.p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-2xl mb-4"
          >
            {error}
          </motion.div>
        )}

        <motion.div variants={staggerContainerVariants} initial="hidden" animate="show" className="space-y-3 mb-6">
          <motion.div variants={staggerItemVariants}>{googleButton}</motion.div>
          <motion.div variants={staggerItemVariants}>{mobileButton}</motion.div>
        </motion.div>

        <div className="relative text-center text-gray-500 text-sm mb-6">
          <span className="px-4 bg-dark-900 relative z-10">or continue with</span>
          <div className="absolute inset-0 border-t border-dark-700 top-1/2" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence initial={false} mode="wait">
            {authMethod === "email" ? (
              <motion.div
                key="email-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input w-full"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="otp-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-2">Mobile number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="input w-full"
                  />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpCountdown > 0}
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-dark-600 disabled:opacity-60 transition"
                  >
                    {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Send OTP"}
                  </button>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Code"
                    className="input w-32 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-center tracking-[0.4em]"
                  />
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-2">
                  <ShieldCheck size={14} />
                  OTP logins are encrypted and expire in 2 minutes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-dark-900 border-t-transparent animate-spin" />
                Please wait...
              </span>
            ) : (
              <>
                Continue
                <ArrowRight size={18} />
              </>
            )}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-gray-400">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="text-primary hover:underline font-semibold">
            Sign up
          </Link>
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {featureCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 * index, duration: 0.35 }}
            whileHover={
              prefersReducedMotion
                ? undefined
                : { y: -6, boxShadow: "0 10px 25px rgba(0,0,0,0.35)", transition: { duration: 0.25 } }
            }
            className="card transition duration-300"
          >
            <div className="mb-2">{card.icon}</div>
            <h3 className="font-heading tracking-wide text-lg mb-2">{card.title}</h3>
            <p className="text-sm text-gray-400">{card.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default Login
