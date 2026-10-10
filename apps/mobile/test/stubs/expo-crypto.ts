/**
 * Test stand-in for `expo-crypto` (aliased in vitest.config.ts). The app uses only
 * `randomUUID()` (src/lib/uuid.ts); Node's own is a faithful replacement, so code that
 * creates rows can run against the real in-memory database (test/helpers/realDb.ts).
 */
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}

export default { randomUUID };
