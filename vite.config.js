import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    // Proxy für lokale Entwicklung (entspricht dem Netlify-Proxy in Produktion)
    proxy: {
      '/oauth/token': {
        target: 'https://connect.parqet.com',
        changeOrigin: true,
        rewrite: path => path.replace('/oauth/token', '/oauth2/token'),
      },
      '/api': {
        target: 'https://connect.parqet.com',
        changeOrigin: true,
        rewrite: path => path.replace('/api', ''),
      },
    },

    // Security Headers auch im Dev-Server setzen
    // Hinweis: 'unsafe-eval' ist hier nötig für Vite HMR – nur lokal, nicht in Produktion
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval'",   // unsafe-eval nötig für Vite HMR (nur dev)
        "style-src 'self' 'unsafe-inline'",  // React inline-styles
        "connect-src 'self' ws://localhost:* https://*.supabase.co wss://*.supabase.co https://connect.parqet.com",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  },
})
