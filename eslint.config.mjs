import js from '@eslint/js';
import globals from 'globals';

// โค้ดแอปเป็น classic script (ไม่ใช่ module) ใช้ namespace กลาง RD และห่อด้วย IIFE
const appGlobals = { RD: 'writable', RD_STORAGE_PREFIX: 'readonly', TestKit: 'writable', supabase: 'readonly' };

export default [
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'js/vendor/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'tests/**/*.js', 'sw.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2023, globals: { ...globals.browser, ...globals.serviceworker, ...appGlobals } },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', '*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2023, globals: { ...globals.node, ...globals.browser } },
  },
];
