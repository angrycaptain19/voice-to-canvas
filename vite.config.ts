import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // tldraw ships ESM-only packages that need pre-bundling
    include: ['tldraw'],
  },
})
