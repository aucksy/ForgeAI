/**
 * R-123 guard: find, in the app's own source, every place it keeps something on the phone — `meta`
 * keys, AsyncStorage keys and zustand `persist` names, the key-value store, SecureStore keys and
 * database tables. backupCoverage.test.ts holds each one to the backup's include / exclude lists, so
 * a new setting that nobody classified fails the tests. Plain Node (fs), no app code imported.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Found {
  meta: Map<string, Set<string>>;
  storage: Map<string, Set<string>>;
  kv: Map<string, Set<string>>;
  secure: Map<string, Set<string>>;
  tables: Map<string, Set<string>>;
  /** Calls whose key is worked out at run time: "<kind>:<file>". */
  dynamic: Set<string>;
}

const TOKEN = String.raw`([A-Za-z_][\w.]*|'[^']*'|` + '`[^`]*`' + ')';

export function scanSource(root: string): Found {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(root);
  const src = new Map(files.map((f) => [path.relative(root, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')]));
  const exported = new Map<string, Set<string>>();
  for (const s of src.values()) {
    for (const m of s.matchAll(/export const ([A-Z_][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) {
      const set = exported.get(m[1]) ?? new Set<string>();
      set.add(m[2]);
      exported.set(m[1], set);
    }
  }
  const resolve = (file: string, tok: string): string | null => {
    if (tok.startsWith("'")) return tok.slice(1, -1);
    if (tok.startsWith('`')) return null;
    const name = tok.split('.').pop() ?? tok;
    // Only a constant (UPPER_CASE) names one fixed key; a variable is worked out at run time.
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return null;
    const local = new RegExp(`const ${name}\\s*=\\s*'([^']+)'`).exec(src.get(file) ?? '');
    if (local) return local[1];
    const g = exported.get(name);
    return g && g.size === 1 ? [...g][0] : null;
  };
  const found: Found = { meta: new Map(), storage: new Map(), kv: new Map(), secure: new Map(), tables: new Map(), dynamic: new Set() };
  const add = (m: Map<string, Set<string>>, key: string, file: string): void => {
    const set = m.get(key) ?? new Set<string>();
    set.add(file);
    m.set(key, set);
  };
  const calls = (kind: 'meta' | 'storage' | 'kv' | 'secure', file: string, s: string, re: RegExp): void => {
    for (const m of s.matchAll(re)) {
      const k = resolve(file, m[1]);
      if (k) add(found[kind], k, file);
      else found.dynamic.add(`${kind}:${file}`);
    }
  };
  for (const [file, s] of src) {
    calls('meta', file, s, new RegExp(String.raw`\b(?:setMeta|getMeta)\(\s*` + TOKEN, 'g'));
    for (const m of s.matchAll(/INTO meta\s*\(key, value\)\s*VALUES\s*\('([^'$]+)'/g)) add(found.meta, m[1], file);
    for (const m of s.matchAll(/meta WHERE key = '([^']+)'/g)) add(found.meta, m[1], file);
    for (const m of s.matchAll(/INTO meta\s*\(key, value\)\s*VALUES\s*\('\$\{([A-Z_]+)\}'/g)) {
      const k = resolve(file, m[1]);
      if (k) add(found.meta, k, file);
    }
    calls('storage', file, s, new RegExp(String.raw`AsyncStorage\.(?:getItem|setItem|removeItem|mergeItem)\(\s*` + TOKEN, 'g'));
    // A file that keeps things in AsyncStorage: every 'forgeai…' constant in it is one of its keys.
    if (s.includes('AsyncStorage')) for (const m of s.matchAll(/const [A-Z][A-Z0-9_]*\s*=\s*'(forgeai[^']*)'/g)) add(found.storage, m[1], file);
    if (s.includes('persist(')) for (const m of s.matchAll(/\bname:\s*'([^']+)'/g)) add(found.storage, m[1], file);
    if (s.includes('expo-sqlite/kv-store')) {
      calls('kv', file, s, new RegExp(String.raw`Storage\.(?:setItemSync|getItemSync|removeItemSync|setItemAsync|getItemAsync|removeItemAsync|setItem|getItem|removeItem)\(\s*` + TOKEN, 'g'));
    }
    calls('secure', file, s, new RegExp(String.raw`SecureStore\.\w+Async\(\s*` + TOKEN, 'g'));
    for (const m of s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) add(found.tables, m[1], file);
  }
  return found;
}
