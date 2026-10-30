import { defineConfig } from 'vitest/config'

/**
 * Two projects, because the two halves of this package fail for different reasons.
 *
 * `core` is pure arithmetic over the fingerprint bank: no DOM, and a jsdom environment would only
 * hide an accidental `document` reach. `client` is React and DOM code, so it needs jsdom.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['tests/core/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/client/**/*.test.ts'],
        },
      },
    ],
  },
})
