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
      eslintjs.configs.recommended,
      tseslint.configs.strict
    ]
  },
  {
    files: ['packages/{web-mcp-devtools,web-mcp-extension}/{src,test}/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        chrome: 'readonly'
      }
    }
  },
  {
    files: ['packages/*/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  }
]);
