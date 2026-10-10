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

  for (const [label, ref, section] of [
    ['Android 11 and lower (fullBackupContent)', fullRef, null],
    ['Android 12 and higher (dataExtractionRules, cloud-backup)', extractRef, 'cloud-backup'],
    ['Android 12 and higher (dataExtractionRules, device-transfer)', extractRef, 'device-transfer'],
  ] as const) {
    const rulesFor = (): { file: string; xml: string } => {
      expect(ref, 'manifest names a rules file').toBeTruthy();
      const file = findXml(ref!);
      expect(file, `rules file ${ref}.xml found`).toBeTruthy();
      let xml = readFileSync(file!, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      if (section) {
        const m = new RegExp(`<${section}[^>]*>([^]*?)</${section}>`).exec(xml);
        expect(m, `<${section}> present`).toBeTruthy();
        xml = m![1];
      }
      return { file: file!, xml };
    };

    // Fixed 10 Oct 2026 (Phase 1 packet A): ForgeAI's own rules include file/SQLite/.
    it(`L-01: ${label}: the rules include the database (or include nothing, which means everything)`, () => {
      const { file, xml } = rulesFor();
      const { hasInclude, coversDb } = includesCoverDb(xml);
      expect(!hasInclude || coversDb, `rules file used: ${file}`).toBe(true);
    });

    it(`L-01: ${label}: AsyncStorage settings (units) are included, SecureStore AI keys are not, photos are not`, () => {
      const { xml } = rulesFor();
      const tags = [...xml.matchAll(/<(include|exclude)\s+([^>]*)\/?>/g)].map((m) => ({
        kind: m[1],
        domain: /domain="([^"]+)"/.exec(m[2])?.[1],
        path: /path="([^"]*)"/.exec(m[2])?.[1] ?? '',
      }));
      const has = (kind: string, domain: string, path: string): boolean =>
        tags.some((t) => t.kind === kind && t.domain === domain && t.path === path);
      expect(has('include', 'database', 'RKStorage')).toBe(true);
      expect(has('include', 'sharedpref', '.')).toBe(true);
      // Keystore keys never restore: restored ciphertext would be garbage.
      expect(has('exclude', 'sharedpref', 'SecureStore')).toBe(true);
      // Photos and exercise media live in the files area outside SQLite/ — never included.
      const fileIncludes = tags.filter((t) => t.kind === 'include' && t.domain === 'file').map((t) => t.path);
      expect(fileIncludes).toEqual(['SQLite/']);
      // Only these domains: no "root" (would sweep in caches), no external storage.
      const domains = new Set(tags.filter((t) => t.kind === 'include').map((t) => t.domain));
      expect([...domains].sort()).toEqual(['database', 'file', 'sharedpref']);
    });
  }

  it('the config plugin keeps the same rules after a future prebuild', () => {
    for (const name of ['forgeai_backup_rules.xml', 'forgeai_data_extraction_rules.xml']) {
      const committed = readFileSync(join(APP, 'android/app/src/main/res/xml', name), 'utf8');
      const source = readFileSync(join(APP, 'plugins/backup-rules', name), 'utf8');
      expect(committed, name).toBe(source);
    }
    const appJson = JSON.parse(readFileSync(join(APP, 'app.json'), 'utf8')) as { expo: { plugins: unknown[] } };
    const plugins = appJson.expo.plugins;
    expect(plugins).toContain('./plugins/backup-rules/withBackupRules.js');
    // expo-secure-store must not point the manifest back at its sharedpref-only rules.
    expect(plugins).toContainEqual(['expo-secure-store', { configureAndroidBackup: false }]);
  });
});
