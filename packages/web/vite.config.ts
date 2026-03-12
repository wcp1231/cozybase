import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 3030,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/stable': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
      '/draft': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
