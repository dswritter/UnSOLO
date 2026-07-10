import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests for the pure money/refund math. These run in plain Node (no DOM, no
// network, no Supabase) — only side-effect-free functions are tested here.
export default defineConfig({
  // Map the `@/` path alias (from tsconfig) so tested modules can import via `@/…`.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
