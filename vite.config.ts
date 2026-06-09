import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** GitHub Pages 子路径部署时设置环境变量，例如 VITE_BASE_URL=/SocialFlow/ */
function viteBase(): string {
  const raw = process.env.VITE_BASE_URL?.trim()
  if (!raw) return '/'
  let b = raw.startsWith('/') ? raw : `/${raw}`
  if (!b.endsWith('/')) b += '/'
  return b
}

// https://vitejs.dev/config/
export default defineConfig({
  base: viteBase(),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
