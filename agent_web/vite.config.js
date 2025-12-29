import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    allowedHosts: [
      'agents.mathenymanor.com',  // ✅ Add your custom domain
      'localhost'                 // keep for local testing
    ]
  }
})