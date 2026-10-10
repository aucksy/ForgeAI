/**
 * Test stand-in for `expo-sqlite` (aliased in vitest.config.ts).
 *
 * By default it behaves like test/stubs/native.ts: opening a database throws, so a unit test
 * that reaches the database by accident fails loudly. A real-SQL test installs an in-memory
 * SQLite through test/helpers/realDb.ts (`bootRealApp` / `installRealDb`), after which the
 * app's own `initDb()` opens THAT database and every repo runs real SQL against it.
 *
 * The hook lives on globalThis (not in this module) because `vi.resetModules()` gives each
 * boot a fresh copy of this module.
 */
type Opener = (name: string) => Promise<unknown>;

const HOOK = '__forgeaiOpenDatabase';

export async function openDatabaseAsync(name: string): Promise<unknown> {
  const open = (globalThis as Record<string, unknown>)[HOOK] as Opener | undefined;
  if (!open) {
    throw new Error(
      'Native module accessed in a unit test (expo-sqlite openDatabaseAsync). ' +
        'Use test/helpers/realDb.ts for a real in-memory database, or vi.mock the caller.',
    );
  }
  return open(name);
}

export default { openDatabaseAsync };
