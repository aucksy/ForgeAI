/**
 * KNOWN DEFECTS — each test below states the behaviour a member SHOULD get, and is marked
 * `it.fails(...)` because today the app does NOT do it. The finding ID from the 10 Oct 2026
 * audit (D:\Apps\ForgeAI\Audit) is in every test name.
 *
 * How this works:
 *   - `it.fails` PASSES while the assertion inside it fails, so CI stays green while the
 *     defect is open.
 *   - The day a fix lands, the assertion starts passing, `it.fails` turns RED, and CI fails
 *     on purpose. The person who fixed it must then switch that test from `it.fails(` to
 *     `it(` (and drop "known defect" from its name) in the same commit. That way a fix can
 *     never land silently, and a fixed defect can never quietly come back.
 *   - Do NOT "fix" a red known-defect test by editing the assertion. Red here means the
 *     defect is fixed (or the code moved) — promote the test, do not weaken it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '../..'); // apps/mobile (this file sits in test/known-defects)
const ROOT = resolve(APP, '../..'); // monorepo root (node_modules are hoisted here)
const SNAPSHOT_PATHS: string[] = []; // e.g. ['backup/forgeai-snapshot.json'] once a fix adds one

function findXml(name: string): string | null {
  const local = join(APP, 'android/app/src/main/res/xml', `${name}.xml`);
  if (existsSync(local)) return local;
  // Library resources are merged into the app at build time.
  const nm = join(ROOT, 'node_modules');
  for (const pkg of readdirSync(nm)) {
    const dirs = pkg.startsWith('@') ? readdirSync(join(nm, pkg)).map((p) => join(pkg, p)) : [pkg];
    for (const d of dirs) {
      const p = join(nm, d, 'android/src/main/res/xml', `${name}.xml`);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function includesCoverDb(xml: string): { hasInclude: boolean; coversDb: boolean } {
  const includes = [...xml.matchAll(/<include\s+([^>]*)\/?>/g)].map((m) => m[1]);
  const hasInclude = includes.length > 0;
  const coversDb = includes.some((attrs) => {
    const domain = /domain="([^"]+)"/.exec(attrs)?.[1];
    const path = /path="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (domain !== 'file') return false;
    return path === '.' || path === 'SQLite' || path.startsWith('SQLite/') ||
      SNAPSHOT_PATHS.some((s) => path === s || s.startsWith(path.replace(/\/?$/, '/')));
  });
  return { hasInclude, coversDb };
}

/**
 * L-01: Android Auto Backup backs up ONLY the included paths once any <include> is present.
 * The workout database lives at <filesDir>/SQLite/forgeai.db (expo-sqlite), i.e. domain
 * "file", path "SQLite". A fix may instead include a snapshot file — list its path in
 * SNAPSHOT_PATHS above when it exists.
 */
describe('L-01 the workout database is in Android automatic backup', () => {
  const manifest = readFileSync(join(APP, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const allowBackup = /android:allowBackup="true"/.test(manifest);
  const fullRef = /android:fullBackupContent="@xml\/([^"]+)"/.exec(manifest)?.[1];
  const extractRef = /android:dataExtractionRules="@xml\/([^"]+)"/.exec(manifest)?.[1];

  // Not a defect today: backup IS allowed. A plain test, so it stays green.
  it('backup is allowed at all', () => {
    expect(allowBackup).toBe(true);
  });

  for (const [label, ref] of [
    ['Android 11 and lower (fullBackupContent)', fullRef],
    ['Android 12 and higher (dataExtractionRules, cloud-backup)', extractRef],
  ] as const) {
    it.fails(`L-01 known defect: ${label}: the rules include the database (or include nothing, which means everything)`, () => {
      expect(ref, 'manifest names a rules file').toBeTruthy();
      const file = findXml(ref!);
      expect(file, `rules file ${ref}.xml found`).toBeTruthy();
      let xml = readFileSync(file!, 'utf8');
      if (label.startsWith('Android 12')) {
        xml = /<cloud-backup[^>]*>([\s\S]*?)<\/cloud-backup>/.exec(xml)?.[1] ?? xml;
      }
      const { hasInclude, coversDb } = includesCoverDb(xml);
      // Today: hasInclude = true (sharedpref only), coversDb = false -> the DB is never backed up.
      expect(!hasInclude || coversDb, `rules file used: ${file}`).toBe(true);
    });
  }
});
