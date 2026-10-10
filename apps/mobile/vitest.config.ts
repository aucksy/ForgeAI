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
// expo-sqlite has its own stub: it still throws by default, but a real-SQL test can plug an
// in-memory SQLite (sql.js) into it — see test/helpers/realDb.ts. expo-crypto's only use
// (randomUUID) is served by Node's own, so code that creates rows can run for real.
const sqliteStub = resolve(__dirname, 'test/stubs/expo-sqlite.ts');
const cryptoStub = resolve(__dirname, 'test/stubs/expo-crypto.ts');

export default defineConfig({
  define: {
    // Some modules reference the RN `__DEV__` global at load time.
    __DEV__: 'true',
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
      { find: 'expo-sqlite', replacement: sqliteStub },
      { find: 'expo-secure-store', replacement: nativeStub },
      { find: 'expo-crypto', replacement: cryptoStub },
      { find: '@react-native-async-storage/async-storage', replacement: nativeStub },
      // Phase 1 workout screen: notifications, sounds and their audio files are
      // device-only; the pure rest/record/routine rules never reach them.
      { find: 'expo-notifications', replacement: nativeStub },
      { find: 'expo-audio', replacement: nativeStub },
      { find: 'expo-haptics', replacement: nativeStub },
      { find: /^.*\.wav$/, replacement: nativeStub },
      // Phase 2: the member's own exercise photo/video (device-only picker and files).
      { find: 'expo-file-system/legacy', replacement: nativeStub },
      { find: 'expo-image-picker', replacement: nativeStub },
      // Audit Phase 5: photo backup copies are shrunk on the phone only.
      { find: 'expo-image-manipulator', replacement: nativeStub },
      // Phase 3: progress photos clear the image library's caches on erase.
      { find: /^expo-image$/, replacement: nativeStub },
      // react-native ships Flow syntax that the bundler can't parse; it is pulled
      // in transitively (e.g. via expo-crypto) but never exercised by pure logic.
      { find: /^react-native$/, replacement: nativeStub },
    ],
  },
  test: {
    environment: 'node',
    // Real-SQLite (sql.js) tests take a few seconds each when the whole suite runs in parallel
    // on a slow machine; 5 s timed some out at random. A real hang still fails, after 30 s.
    testTimeout: 30000,
    include: ['test/**/*.test.ts'],
    // Bundled pictures (Phase 2 exercise demos) load as opaque numbers, as under Metro.
    setupFiles: ['test/setup/assets.ts'],
    // Deterministic clock/timezone is asserted explicitly per test; keep the
    // runner itself free of global date mutation.
  },
});
