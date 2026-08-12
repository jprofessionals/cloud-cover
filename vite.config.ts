import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const MET_USER_AGENT = 'cloud-cover/0.1 github.com/runarbell/cloud-cover'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // MET krever en identifiserende User-Agent, som nettleser-JS ikke får sette.
      // I dev løser vi det her; i produksjon gjør api/met.ts det samme.
      '/api/met': {
        target: 'https://api.met.no',
        changeOrigin: true,
        headers: { 'User-Agent': MET_USER_AGENT },
        rewrite: (path) =>
          path.replace(/^\/api\/met/, '/weatherapi/locationforecast/2.0/complete'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
