import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import PageTransition from './components/PageTransition';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Battle from './pages/Battle';
import BattleRoyale from './pages/BattleRoyale';
import BattleRoyaleMode from './pages/BattleRoyaleMode';
import CustomRoomLobby from './pages/CustomRoomLobby';
import BattleRoyaleMatch from './pages/BattleRoyaleMatch';
import BattleRoyaleAdmin from './pages/BattleRoyaleAdmin';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import AITutor from './pages/AITutor';
import MatchResult from './pages/MatchResult';
import { ArrowLeft } from 'lucide-react';
import './App.css';

// Pages that show the full Navbar
const NAVBAR_PATHS = ['/lobby', '/leaderboard', '/ai-tutor', '/dashboard'];

// Pages that should NOT show the back button
const NO_BACK_BUTTON_PATHS = ['/', '/login', '/register', '/lobby', '/leaderboard', '/ai-tutor', '/dashboard'];

// Path prefixes that should NOT show the back button (have their own navigation)
const NO_BACK_BUTTON_PREFIXES = ['/custom-room/'];

const BackButton = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed top-4 left-4 z-50 flex items-center gap-2 px-4 py-2 bg-dark-800/80 backdrop-blur-md border border-dark-600 rounded-xl text-gray-300 hover:text-primary hover:border-primary/50 transition-all shadow-lg hover:shadow-primary/10 group"
    >
      <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
      <span className="text-sm font-medium">Back</span>
    </button>
  );
};

function App() {
  const location = useLocation();

  const showNavbar = NAVBAR_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  const showBackButton = !showNavbar
    && !NO_BACK_BUTTON_PATHS.includes(location.pathname)
    && !NO_BACK_BUTTON_PREFIXES.some(prefix => location.pathname.startsWith(prefix));

  return (
    <AuthProvider>
      <SocketProvider>
        <div className="min-h-screen bg-dark-900 flex flex-col">
          {showNavbar && <Navbar />}
          {showBackButton && <BackButton />}
          <AnimatePresence initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <PageTransition>
                    <Home />
                  </PageTransition>
                }
              />
              <Route
                path="/login"
                element={
                  <PageTransition>
                    <Login />
                  </PageTransition>
                }
              />
              <Route
                path="/register"
                element={
                  <PageTransition>
                    <Register />
                  </PageTransition>
                }
              />
              <Route
                path="/lobby"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <Lobby />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battle/:roomId"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <Battle />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battle-royale-mode"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <BattleRoyaleMode />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/custom-room/:roomId"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <CustomRoomLobby />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battle-royale/:roomId"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <BattleRoyale />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battle-royale-match/:roomId"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <BattleRoyaleMatch />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/battle-royale-admin/:roomId"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <BattleRoyaleAdmin />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <Dashboard />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leaderboard"
                element={
                  <PageTransition>
                    <Leaderboard />
                  </PageTransition>
                }
              />
              <Route
                path="/ai-tutor"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <AITutor />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/match-result"
                element={
                  <ProtectedRoute>
                    <PageTransition>
                      <MatchResult />
                    </PageTransition>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </div>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
