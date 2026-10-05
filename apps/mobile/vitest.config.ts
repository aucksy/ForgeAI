import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * O1 test lane — pure-TypeScript unit tests (no React Native render, no native,
 * no emulator). Runs under Node via esbuild. Tests import the app's PURE logic
 * from `src/**` and assert on it; they never edit frozen source.
 *
 * Native packages (expo-sqlite / expo-secure-store / async-storage) are aliased
 * to a stub so a service that transitively imports them can still be loaded to
 * reach its pure exports. See test/stubs/native.ts.
 */
const nativeStub = resolve(__dirname, 'test/stubs/native.ts');

export default defineConfig({
  define: {
    // Some modules reference the RN `__DEV__` global at load time.
    __DEV__: 'true',
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
      { find: 'expo-sqlite', replacement: nativeStub },
      { find: 'expo-secure-store', replacement: nativeStub },
      { find: 'expo-crypto', replacement: nativeStub },
      { find: '@react-native-async-storage/async-storage', replacement: nativeStub },
      // Phase 1 workout screen: notifications, sounds and their audio files are
      // device-only; the pure rest/record/routine rules never reach them.
      { find: 'expo-notifications', replacement: nativeStub },
      { find: 'expo-audio', replacement: nativeStub },
      { find: 'expo-haptics', replacement: nativeStub },
      { find: /^.*\.wav$/, replacement: nativeStub },
      // react-native ships Flow syntax that the bundler can't parse; it is pulled
      // in transitively (e.g. via expo-crypto) but never exercised by pure logic.
      { find: /^react-native$/, replacement: nativeStub },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Deterministic clock/timezone is asserted explicitly per test; keep the
    // runner itself free of global date mutation.
  },
});
