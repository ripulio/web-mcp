import {defineConfig} from 'vitest/config';
import {playwright} from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          include: ['./packages/*/test/**/*.test.ts'],
          exclude: ['./packages/*/test/**/*.browser.test.ts']
        }
      },
      {
        extends: true,
        test: {
          include: ['./packages/*/test/**/*.browser.test.ts'],
          browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            screenshotFailures: false,
            instances: [{browser: 'chromium'}]
          }
        }
      }
    ]
  }
});
