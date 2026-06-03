import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
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
            }
        }
    }
})