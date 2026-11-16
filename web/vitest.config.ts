import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
      'http://127.0.0.1:54321',
    ),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
      'vitest-publishable-key',
    ),
  },
  resolve: {
    alias: {
      'virtual:pwa-register/react': path.resolve(
        import.meta.dirname,
        'src/pwa/registerSwStub.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
