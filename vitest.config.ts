import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Default to Node for calendar, money, server-action and embedded database tests.
// Component interaction tests opt into happy-dom with a file-level directive.
export default defineConfig({
  // Match Next.js's automatic JSX runtime for component interaction tests.
  esbuild: { jsx: 'automatic' },
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
