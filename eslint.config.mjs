// Audit toolkit pick 4 (15 Oct 2026): type-aware checks for promise errors nobody sees.
// Only rules that find a REAL silent failure are on — no style rules. scripts/ci/promise_ratchet.mjs
// runs this and fails CI when a workspace has MORE findings than its baseline (the count may only
// go down). Run locally: node scripts/ci/promise_ratchet.mjs
import tseslint from 'typescript-eslint';

const rules = {
  // A promise started and never awaited or .catch()ed: its error vanishes.
  '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
  // An async function where a plain callback is expected (onPress, forEach, setTimeout): its
  // rejection is dropped. Attribute handlers are checked too.
  '@typescript-eslint/no-misused-promises': 'error',
  // catch (e) {} with nothing inside.
  'no-empty': ['error', { allowEmptyCatch: false }],
};

export default tseslint.config(
  {
    // The code's own eslint-disable comments name Expo's rules, which are not loaded here; and a
    // comment must never hide one of these findings from the ratchet.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/android/**', '**/ios/**', '**/.expo/**', '**/*.config.*', '**/scripts/**', '**/coverage/**'],
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './apps/mobile/tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules,
  },
  {
    files: ['apps/dashboard/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './apps/dashboard/tsconfig.app.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules,
  },
);
