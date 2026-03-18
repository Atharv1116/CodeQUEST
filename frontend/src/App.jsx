import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import BattleRoyaleMatch from './pages/BattleRoyaleMatch';
import BattleRoyaleAdmin from './pages/BattleRoyaleAdmin';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import AITutor from './pages/AITutor';
import './App.css';

function App() {
  const location = useLocation();

  return (
    <AuthProvider>
      <SocketProvider>
        <div className="min-h-screen bg-dark-900 flex flex-col">
          <Navbar />
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </div>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
