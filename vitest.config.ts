import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  test: {
		projects: [
			{
				extends: true,
				test: {
					include: ['./packages/*/test/**/*.test.ts'],
          exclude: ['./packages/*/test/**/*.browser.test.ts'],
				}
			},
			{
				extends: true,
				test: {
					include: [
						'./packages/*/test/**/*.browser.test.ts',
					],
          browser: {
            provider: 'playwright',
            enabled: true,
            headless: true,
            screenshotFailures: false,
            instances: [
              { browser: 'chromium' },
            ],
          },
				}
			}
		]
  }
})
