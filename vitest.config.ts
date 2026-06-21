import { defineConfig } from 'vitest/config'

// Unit tests for the pure money/refund math. These run in plain Node (no DOM, no
// network, no Supabase) — only side-effect-free functions are tested here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
