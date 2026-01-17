import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within SocketProvider');
  }

  // When the provider is mounted but the socket connection hasn't finished yet,
  // the context value is null. We intentionally return null here instead of
  // throwing so screens can render a loader instead of crashing to black.
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (user && token) {
      // Use environment variable for socket URL, fallback to localhost for development
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 
                       import.meta.env.VITE_API_URL || 
                       'http://localhost:3000';
      
      const newSocket = io(socketUrl, {
        auth: { token, userId: user.id },
        // Use polling as fallback for Vercel compatibility
        transports: ['polling', 'websocket'],
        upgrade: true,
        rememberUpgrade: true
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        newSocket.emit('authenticate', { token, userId: user.id });
      });

      newSocket.on('authenticated', ({ success }) => {
        if (success) {
          console.log('Socket authenticated');
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user, token]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
