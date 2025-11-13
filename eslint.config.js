import eslintjs from '@eslint/js';
import tseslint from 'typescript-eslint';
import {defineConfig} from 'eslint/config';
import globals from "globals";

export default defineConfig([
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'packages/*/test/**/*.{ts,tsx}'],
    plugins: {
      eslint: eslintjs,
      typescript: tseslint
    },
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    },
    extends: [
      tseslint.configs.strict,
      eslintjs.configs.recommended
    ]
  },
  {
    files: [
      'packages/web-mcp-devtools/{src,test}/**/*.{ts,tsx}',
      'packages/web-mcp-injector/{src,test}/**/*.{ts,tsx}'
    ],
    languageOptions: {
      globals: {
        chrome: 'readonly'
      }
    }
  }
]);
