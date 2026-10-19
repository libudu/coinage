import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline'
  return {
    plugins: [react(), tailwindcss(), ...(offline ? [viteSingleFile({ outputFileName: 'Coinage.html' })] : [])],
    resolve: offline ? {
      alias: [{
        find: './createTraceWorker',
        replacement: fileURLToPath(new URL('./src/features/tracing/createTraceWorker.offline.ts', import.meta.url)),
      }],
    } : undefined,
    build: offline ? {
      outDir: 'dist/offline',
      copyPublicDir: false,
      modulePreload: false,
    } : undefined,
  }
})
