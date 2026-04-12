import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Code2 } from 'lucide-react'

const InputField = ({ label, name, type: initialType = 'text', value, onChange, placeholder, autoComplete, required = true }) => {
  const [show, setShow] = useState(false)
  const isPassword = initialType === 'password'
  const type = isPassword ? (show ? 'text' : 'password') : initialType
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{label}</label>
      <div className="relative">
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
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

const Register = () => {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({ username: '', email: '', password: '', college: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = e => setFormData(p => ({ ...p, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (formData.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setLoading(true)
    const result = await register(formData.username, formData.email, formData.password, formData.college)
    if (result.success) {
      navigate('/lobby')
    } else {
      setError(result.error || 'Registration failed.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-purple-500/4 blur-[110px] pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg bg-dark-800/60 backdrop-blur-xl border border-dark-600/60 rounded-3xl p-8 md:p-10 shadow-2xl"
        style={{ boxShadow: '0 0 60px rgba(0,255,195,0.06)' }}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Code2 size={16} className="text-primary" />
          </div>
          <span className="text-base font-black text-white">CodeQuest</span>
        </div>

        <div className="mb-7">
          <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold mb-2">Join the arena</p>
          <h1 className="text-3xl font-black text-white">Create account</h1>
          <p className="text-gray-500 text-sm mt-1.5">Start your competitive programming journey</p>
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
          <InputField label="Username" name="username" value={formData.username} onChange={handleChange}
            placeholder="CoolCoder42" autoComplete="username" />
          <InputField label="Email" name="email" type="email" value={formData.email} onChange={handleChange}
            placeholder="you@example.com" autoComplete="email" />
          <InputField label="Password" name="password" type="password" value={formData.password} onChange={handleChange}
            placeholder="Min. 6 characters" autoComplete="new-password" />
          <InputField label="College (optional)" name="college" value={formData.college} onChange={handleChange}
            placeholder="Your university" autoComplete="organization" required={false} />

          <motion.button type="submit" disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.015 }} whileTap={{ scale: loading ? 1 : 0.985 }}
            className="w-full bg-primary text-dark-900 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-60 transition mt-2">
            {loading
              ? <><div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" /> Creating account…</>
              : <>Create account <ArrowRight size={17} /></>}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-cyan-300 font-bold transition">
            Sign in →
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default Register
