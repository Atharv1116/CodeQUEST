import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Code2, Zap, Trophy } from 'lucide-react'

const FEATURES = [
  { icon: <Zap size={20} className="text-primary" />, text: 'Real-time matchmaking' },
  { icon: <Trophy size={20} className="text-yellow-400" />, text: 'Climb the rankings' },
  { icon: <Code2 size={20} className="text-purple-400" />, text: 'AI-powered coaching' },
]

const InputField = ({ label, type: initialType = 'text', value, onChange, placeholder, autoComplete }) => {
  const [show, setShow] = useState(false)
  const isPassword = initialType === 'password'
  const type = isPassword ? (show ? 'text' : 'password') : initialType
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full bg-dark-900/60 border border-dark-600 focus:border-primary/70 focus:ring-2 focus:ring-primary/15 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 transition outline-none text-sm"
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  )
}

const Login = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    if (result.success) {
      navigate('/lobby')
    } else {
      setError(result.error || 'Invalid credentials.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark-900 flex relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />

      {/* Left panel — brand / features (desktop only) */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] bg-dark-800/40 border-r border-dark-700/50 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-purple-500/3 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Code2 size={18} className="text-primary" />
            </div>
            <span className="text-lg font-black text-white tracking-wide">CodeQuest</span>
          </div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Where coders<br />
            <span className="text-primary">compete and grow.</span>
          </h2>
          <p className="text-gray-400 text-base leading-relaxed mb-10">
            Real matches. Real rivals. Real improvement.
            Join thousands of competitive programmers.
          </p>
          <div className="space-y-4">
            {FEATURES.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-8 h-8 rounded-lg bg-dark-700/80 border border-dark-600 flex items-center justify-center flex-shrink-0">
                  {f.icon}
                </div>
                {f.text}
              </motion.div>
            ))}
          </div>
        </div>
        {/* Decorative grid pattern */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-dark-900/20 to-transparent pointer-events-none" />
        <p className="relative text-xs text-gray-600">© 2025 CodeQuest. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Code2 size={16} className="text-primary" />
            </div>
            <span className="text-base font-black text-white">CodeQuest</span>
          </div>

          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold mb-2">Welcome back</p>
            <h1 className="text-3xl font-black text-white">Sign in</h1>
            <p className="text-gray-500 text-sm mt-1.5">Enter your credentials to continue</p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mb-5 flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm">
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />
            <InputField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" />

            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.985 }}
              className="w-full bg-primary text-dark-900 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-60 transition mt-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" /> Signing in…</>
                : <>Sign in <ArrowRight size={17} /></>}
            </motion.button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary hover:text-cyan-300 font-bold transition">
              Create one →
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default Login
