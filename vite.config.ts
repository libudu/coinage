import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { createApp } from './src/server/app'

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'coinage-local-storage',
    configureServer(server: import('vite').ViteDevServer) {
      const handle = createApp({ dataDir: fileURLToPath(new URL('./data', import.meta.url)) })
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) void handle(req, res)
        else next()
      })
    },
  }],
  server: { host: '127.0.0.1' },
  build: { outDir: 'dist/client', target: 'es2022' },
})
