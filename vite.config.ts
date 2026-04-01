import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const tailwindConfig = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      }
    }
  },
  css: {
    postcss: {
      plugins: [

        tailwindcss(tailwindConfig as any),
        autoprefixer(),
      ],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage/frontend',
      reporter: ['text', 'html'],
      include: [
        'src/api/pollApi.ts',
        'src/auth/rbac.ts',
        'src/context/AuthContext.tsx',
        'src/context/ThemeContext.tsx',
        'src/components/PollList.tsx',
        'src/components/ExternalWeatherCard.tsx',
        'src/components/views/LoginView.tsx',
        'src/components/views/PollVotingView.tsx',
      ],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      thresholds: {
        lines: 65,
        functions: 65,
        statements: 65,
        branches: 55,
      },
    },
  },
})
