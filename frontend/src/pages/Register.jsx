import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Phone, ShieldCheck } from 'lucide-react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';

const highlightCards = [
  {
    title: 'Coach-crafted Plans',
    body: 'Let AI Coach scan your skills and generate a personalized training plan.'
  },
  {
    title: 'Squad Ready',
    body: 'Instant team invites, shared lobbies, and cross-device notifications.'
  },
  {
    title: 'Mobile OTP Signup',
    body: 'Skip passwords—link your number and start coding within seconds.'
  }
];

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
};

const textStagger = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }
  })
};

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();

  const initialPhone = location.state?.phone || '';

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    college: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState(initialPhone ? 'otp' : 'email');
  const [phone, setPhone] = useState(initialPhone);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(Boolean(initialPhone));
  const [otpCountdown, setOtpCountdown] = useState(0);

  useEffect(() => {
    if (!otpSent || otpCountdown <= 0) return undefined;
    const t = setInterval(() => setOtpCountdown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [otpSent, otpCountdown]);

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (authMethod === 'otp') {
      if (!phone || otp.length < 4) {
        setError('Enter your mobile number and the 4-digit code we sent.');
        return;
      }
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        navigate('/login', { state: { phone } });
      }, 900);
      return;
    }

    setLoading(true);
    const result = await register(formData.username, formData.email, formData.password, formData.college);
    if (result.success) {
      navigate('/lobby');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const handleGoogleSignup = () => {
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setError('Google signup is coming soon. Use email or OTP temporarily.');
    }, 900);
  };

  const handleSendOtp = () => {
    if (!phone) {
      setError('Add your mobile number first.');
      return;
    }
    setError('');
    setOtpSent(true);
    setOtpCountdown(30);
  };

  const googleButton = useMemo(
    () => (
      <motion.button
        type="button"
        onClick={handleGoogleSignup}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        className="w-full bg-white/10 text-white border border-white/20 rounded-xl py-3 px-4 flex items-center justify-center gap-3 font-semibold hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 transition"
      >
        <svg width="20" height="20" viewBox="0 0 533.5 544.3" aria-hidden="true">
          <path fill="#4285f4" d="M533.5 278.4a320.1 320.1 0 00-4.7-55.6H272v105.2h146.9a125.7 125.7 0 01-54.5 82.4v68h87.9c51.5-47.4 80.2-117.3 80.2-200z" />
          <path fill="#34a853" d="M272 544.3c73.5 0 135.2-24.3 180.3-66.2l-87.9-68c-24.4 16.4-55.7 26-92.4 26-70.9 0-130.9-47.8-152.3-112.1H27.2v70.4c45.2 89.7 138.2 149.9 244.8 149.9z" />
          <path fill="#fbbc04" d="M119.7 323.9c-10.3-30.7-10.3-63.5 0-94.2V159.3H27.2a272 272 0 000 225.6z" />
          <path fill="#ea4335" d="M272 106.1c39.9-.6 78.2 14.6 107.2 42.4l80.1-80C409.5 24.2 342.5-.7 272 0 165.4 0 72.4 60.3 27.2 150l92.5 70.4C141.1 153 201.1 105.3 272 106.1z" />
        </svg>
        Sign up with Google
      </motion.button>
    ),
    [prefersReducedMotion]
  );

  const mobileButton = (
    <motion.button
      type="button"
      onClick={() => setAuthMethod((prev) => (prev === 'otp' ? 'email' : 'otp'))}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      className="w-full bg-primary/10 text-primary border border-primary/40 rounded-xl py-3 px-4 flex items-center justify-center gap-3 font-semibold hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 transition"
    >
      <Phone size={18} />
      {authMethod === 'otp' ? 'Use Email & Password' : 'Sign up with Mobile OTP'}
    </motion.button>
  );

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-10">
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="glass-card p-8 rounded-3xl max-w-3xl w-full mx-auto shadow-2xl neon-border">
        <div className="text-center mb-8">
          <motion.p custom={0} variants={textStagger} className="text-xs uppercase tracking-[0.35em] text-primary">
            Join the quest
          </motion.p>
          <motion.h1 custom={1} variants={textStagger} className="text-4xl font-bold text-gradient">
            Create your CodeQuest account
          </motion.h1>
          <motion.p custom={2} variants={textStagger} className="text-gray-400 mt-3 max-w-2xl mx-auto">
            Unlock AI-driven coaching, team battles, and live arenas. Choose a secure login style that works for you.
          </motion.p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-2xl mb-4 text-center">
            {error}
          </motion.div>
        )}

        <div className="space-y-3 mb-6">
          {googleButton}
          {mobileButton}
        </div>

        <div className="relative text-center text-gray-500 text-sm mb-6">
          <span className="px-4 bg-dark-900 relative z-10">or sign up with</span>
          <div className="absolute inset-0 border-t border-dark-700 top-1/2" aria-hidden="true" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence initial={false} mode="wait">
            {authMethod === 'email' ? (
              <motion.div
                key="email-signup"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="grid md:grid-cols-2 gap-4"
              >
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Username</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={6}
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">College (optional)</label>
                  <input
                    type="text"
                    name="college"
                    value={formData.college}
                    onChange={handleChange}
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="otp-signup"
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
                    className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpCountdown > 0}
                    className="flex-1 bg-dark-700 border border-dark-500 rounded-xl px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-dark-600 disabled:opacity-60 transition"
                  >
                    {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Send OTP'}
                  </button>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Code"
                    className="w-32 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-center tracking-[0.4em]"
                  />
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-2">
                  <ShieldCheck size={14} />
                  We&apos;ll link this phone to your CodeQuest ID. OTP expires in 2 minutes.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            className="w-full bg-primary text-dark-900 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-dark-900 border-t-transparent animate-spin" />
                Please wait...
              </span>
            ) : (
              <>
                Create account
                <ArrowRight size={18} />
              </>
            )}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-semibold">
            Login
          </Link>
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {highlightCards.map((card, idx) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.15, duration: 0.35 }}
            whileHover={
              prefersReducedMotion
                ? undefined
                : { y: -6, boxShadow: '0 10px 25px rgba(0,0,0,0.35)', transition: { duration: 0.25 } }
            }
            className="glass-card p-4 rounded-2xl border border-white/5 hover:neon-border transition duration-300"
          >
            <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
            <p className="text-sm text-gray-400">{card.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Register;
