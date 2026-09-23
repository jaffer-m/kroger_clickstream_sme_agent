import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8002',
    },
    // Serve index.html for all non-asset routes so /audit works in the SPA
    historyApiFallback: true,
  },
})
