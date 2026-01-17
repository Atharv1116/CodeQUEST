import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.VITE_SOCKET_URL || 'http://localhost:3000',
        ws: true
      }
    }
  }
});
