/**
 * R-631 slice A: reads the CODE for every place personal data can go or be kept, so the test next
 * to this file (dataFlows.test.ts) can check each one against docs/legal/data-flows.json.
 *
 * Five readers, each PURE over the files on disk (no network, no build):
 *  - hosts:    every outside web address written in app, watch, website, worker and server code;
 *  - packages: every outside code library those files import (a library can call out with no
 *              address in our code, e.g. the Claude SDK);
 *  - tables:   every table (and storage bucket) in supabase/migrations and deploy/panel/migrations,
 *              with its columns, so the test can pick the ones that hold personal data;
 *  - bindings: every storage binding (and the logs switch) in the workers' wrangler.jsonc files;
 *  - backup:   every include/exclude in the Android backup rules, and the watch app's allowBackup.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

/** Where outbound addresses and libraries are looked for (design 9a; the brief's list). */
export const CODE_ROOTS = [
  'apps/mobile/src',
  'apps/mobile/android/wear',
  'apps/mobile/plugins',
  'apps/dashboard/index.html', // the admin app's own page (it loads the letters)
  'apps/dashboard/src',
  'apps/dashboard/public',
  'apps/hq',
  'deploy/hq',
  'deploy/panel',
  'deploy/gate',
  'supabase/functions',
] as const;

const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|kt|java|html|xml|jsonc|json|css|webmanifest)$|(^|\/)_headers$/;
const SKIP_DIR = new Set(['node_modules', 'build', 'dist', '.gradle', 'test', 'tests', '__tests__', 'e2e', 'androidTest']);
const SKIP_FILE = /\.(test|spec)\.[a-z]+$/;

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const posix = (p: string): string => p.split(sep).join('/');

function walk(rel: string, out: string[] = []): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return out;
  if (!statSync(abs).isDirectory()) {
    if (CODE_EXT.test(rel)) out.push(posix(rel));
    return out;
  }
  for (const name of readdirSync(abs)) {
    const childRel = posix(join(rel, name));
    const st = statSync(join(ROOT, childRel));
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(name)) walk(childRel, out);
    } else if (CODE_EXT.test(childRel) && !SKIP_FILE.test(name)) {
      out.push(childRel);
    }
  }
  return out;
}

/** Every code file under CODE_ROOTS, repo-relative with forward slashes. */
export function codeFiles(): string[] {
  return CODE_ROOTS.flatMap((r) => walk(r)).sort();
}

/**
 * The file's text with comments removed, so an address in a "Source: https://..." note is not
 * mistaken for a call. Line based on purpose (simple to trust): a line that starts a comment goes,
 * a trailing " // ..." goes, block comments and HTML/XML comments go.
 */
export function stripComments(file: string, text: string): string {
  let t = text;
  if (/\.(html|xml)$/.test(file)) t = t.replace(/<!--[\s\S]*?-->/g, '');
  if (/(^|\/)_headers$/.test(file)) return t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const raw of t.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // Block comments that open (and maybe close) on this line, outside of an address.
    for (;;) {
      const start = line.search(/(^|[^:/'"`\\])\/\*/);
      if (start < 0) break;
      const at = line.indexOf('/*', start);
      const end = line.indexOf('*/', at + 2);
      if (end < 0) {
        line = line.slice(0, at);
        inBlock = true;
        break;
      }
      line = line.slice(0, at) + line.slice(end + 2);
    }
    if (/^\s*(\/\/|\*)/.test(line)) continue;
    line = line.replace(/(^|\s)\/\/.*$/, '$1');
    out.push(line);
  }
  return out.join('\n');
}

export type Found = { key: string; file: string };

const HOST_RE = /\b(?:https?|wss?):\/\/((?:\$\{[^}]*\}\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Every web address host in the code (lower case; "${x}.supabase.co" becomes "*.supabase.co"). */
export function scanHosts(files = codeFiles()): Found[] {
  const out: Found[] = [];
  for (const file of files) {
    const text = stripComments(file, read(file));
    const seen = new Set<string>();
    for (const m of text.matchAll(HOST_RE)) {
      const host = m[1]!.replace(/^\$\{[^}]*\}/, '*').replace(/\.$/, '').toLowerCase();
      if (!seen.has(host)) {
        seen.add(host);
        out.push({ key: host, file });
      }
    }
  }
  return out;
}

const SPEC = `['"]([@\\w][\\w@./:-]*)['"]`;
const IMPORT_RES = [
  new RegExp(`^\\s*import\\s+(?:type\\s+)?[\\w*{}\\s,$]*?\\s*from\\s*${SPEC}`, 'gm'),
  new RegExp(`^\\s*import\\s*${SPEC}`, 'gm'),
  new RegExp(`^\\s*export\\s+(?:type\\s+)?[\\w*{}\\s,$]*?\\s*from\\s*${SPEC}`, 'gm'),
  new RegExp(`\\bimport\\(\\s*${SPEC}\\s*\\)`, 'g'),
  new RegExp(`\\brequire\\(\\s*${SPEC}\\s*\\)`, 'g'),
];

/** Node's own modules: they run where the code runs and call no one by themselves. */
const NODE_BUILTIN = new Set(['fs', 'path', 'url', 'crypto', 'os', 'child_process', 'util', 'stream', 'buffer', 'events', 'zlib', 'sqlite']);

/** "@scope/pkg/sub" -> "@scope/pkg"; "pkg/sub" -> "pkg"; "jsr:@supabase/x@2" -> "jsr:@supabase/x". */
export function packageOf(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('node:')) return null;
  if (NODE_BUILTIN.has(spec.split('/')[0]!)) return null;
  if (/^https?:/.test(spec)) return null; // an address import is caught by scanHosts
  const prefix = /^(jsr:|npm:)/.exec(spec)?.[1] ?? '';
  const rest = spec.slice(prefix.length);
  const parts = rest.split('/');
  const name = rest.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0]!;
  return prefix + name.replace(/(.)@[^/]*$/, '$1');
}

/**
 * Every outside library imported by JS/TS code, and every Kotlin/Java import outside the
 * language itself (as "kt:com.google.android.gms.wearable.Wearable").
 */
export function scanPackages(files = codeFiles()): Found[] {
  const out: Found[] = [];
  for (const file of files) {
    const seen = new Set<string>();
    const add = (key: string) => {
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, file });
      }
    };
    if (/\.(kt|java)$/.test(file)) {
      for (const m of read(file).matchAll(/^import\s+([\w.]+)/gm)) add(`kt:${m[1]}`);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue;
    const text = stripComments(file, read(file));
    for (const re of IMPORT_RES) {
      for (const m of text.matchAll(re)) {
        const p = packageOf(m[1]!);
        if (p) add(p);
      }
    }
  }
  return out;
}

export type Table = { key: string; file: string; columns: string[] };

function stripSql(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** The text inside the parenthesis that opens at `open` (balanced). */
function inside(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  let quote = false;
  for (const ch of text) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !quote) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const NOT_A_COLUMN = /^(primary|unique|foreign|check|constraint|exclude|like)$/i;
const unq = (s: string) => s.replace(/"/g, '').toLowerCase();

/**
 * Every table the migrations leave standing, in file order, with its columns (create table plus
 * later "alter table ... add column"). `db` is "supabase" or "panel"; Supabase names keep their
 * schema ("supabase:public.gym_members"). Storage buckets come out as "supabase:bucket:<id>".
 */
export function scanTables(): Table[] {
  const sets: Array<{ db: string; dir: string }> = [
    { db: 'supabase', dir: 'supabase/migrations' },
    { db: 'panel', dir: 'deploy/panel/migrations' },
  ];
  const tables = new Map<string, Table>();
  const ident = '((?:"?[A-Za-z_][\\w$]*"?\\.)?"?[A-Za-z_][\\w$]*"?)';
  for (const { db, dir } of sets) {
    const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.sql')).sort();
    const keyOf = (name: string) => {
      const n = unq(name);
      return `${db}:${db === 'supabase' && !n.includes('.') ? `public.${n}` : n}`;
    };
    for (const f of files) {
      const rel = `${dir}/${f}`;
      const sql = stripSql(read(rel));
      const stmts = sql.split(/;\s*(?=\n|$)/);
      for (const s of stmts) {
        const create = new RegExp(`create\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${ident}\\s*\\(`, 'i').exec(s);
        if (create) {
          const key = keyOf(create[1]!);
          const body = inside(s, create.index + create[0].length - 1);
          const columns = splitTop(body)
            .map((c) => c.trim().split(/\s+/)[0] ?? '')
            .filter((c) => c && !NOT_A_COLUMN.test(c))
            .map(unq);
          const prev = tables.get(key);
          tables.set(key, { key, file: prev?.file ?? rel, columns: [...new Set([...(prev?.columns ?? []), ...columns])] });
          continue;
        }
        const alter = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${ident}([\\s\\S]*)`, 'i').exec(s);
        if (alter) {
          const key = keyOf(alter[1]!);
          const t = tables.get(key);
          if (t) {
            for (const m of alter[2]!.matchAll(/add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?("?[A-Za-z_][\w$]*"?)/gi)) {
              const c = unq(m[1]!);
              if (!NOT_A_COLUMN.test(c) && !t.columns.includes(c)) t.columns.push(c);
            }
            const ren = /rename\s+to\s+("?[A-Za-z_][\w$]*"?)/i.exec(alter[2]!);
            if (ren) {
              tables.delete(key);
              const nk = keyOf(key.includes('.') ? `${key.split(':')[1]!.split('.')[0]}.${unq(ren[1]!)}` : unq(ren[1]!));
              tables.set(nk, { ...t, key: nk });
            }
          }
          continue;
        }
        const drop = /drop\s+table\s+(?:if\s+exists\s+)?([\w$."\s,]+)/i.exec(s);
        if (drop) {
          for (const n of drop[1]!.split(',')) {
            const name = n.trim().split(/\s+/)[0];
            if (name) tables.delete(keyOf(name));
          }
          continue;
        }
        for (const m of s.matchAll(/insert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/gi)) {
          const key = `${db}:bucket:${m[1]}`;
          if (!tables.has(key)) tables.set(key, { key, file: rel, columns: ['file'] });
        }
      }
    }
  }
  return [...tables.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Column names that point at a person or carry what a person wrote or did. Broad on purpose: a
 * table that matches must be on the list (or named as holding no personal data, with a reason).
 */
export const PERSONAL_COLUMN =
  /(^|_)(name|phone|mobile|msisdn|wa|whatsapp|email|mail|dob|birth|age|gender|sex|address|photo|picture|pic|avatar|selfie|image|jpeg|weight|height|body|measure|measurements|note|notes|message|messages|msg|text|question|answer|reply|comment|bio|ip|device|ua|agent|token|push|member|members|user|uid|auth|profile|staff|trainer|person|people|who|by|owner|card|upi|vpa|account|bank|pan|gst|location|lat|lng|city|workout|workouts|session|checkin|punch|visit|heart|sleep|steps|diet|meal|food|audio|voice|transcript|data|payload|items|record|lead|referrer|friend|number|contact|login|pin|code|hash|proof|summary|board|kg|request|spoken|details|detail|reason|result|query|objects|actions|lines|recent|tape|csv|endpoint|p256dh|visitor|reader|creds|hint|ifsc|payee)($|_)/;

export function personalColumns(columns: readonly string[]): string[] {
  return columns.filter((c) => PERSONAL_COLUMN.test(c));
}

/** The worker config files (every wrangler.jsonc / wrangler.json / wrangler.toml under deploy/). */
export function wranglerFiles(): string[] {
  const out: string[] = [];
  const dirs = ['deploy', 'apps', 'supabase'];
  const look = (rel: string) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      const child = posix(join(rel, name));
      if (statSync(join(ROOT, child)).isDirectory()) {
        if (name !== 'node_modules' && !name.startsWith('.')) look(child);
      } else if (/^wrangler\.(jsonc?|toml)$/.test(name)) out.push(child);
    }
  };
  dirs.forEach(look);
  return out.sort();
}

/** JSONC -> value: drops // and block comments outside strings, and trailing commas. */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const BINDING_LISTS = [
  'd1_databases',
  'kv_namespaces',
  'r2_buckets',
  'durable_objects',
  'queues',
  'analytics_engine_datasets',
  'vectorize',
  'hyperdrive',
  'services',
  'send_email',
  'workflows',
];

/**
 * Every storage-like binding as "<worker dir>:<kind>:<binding>", e.g. "hq:kv_namespaces:BACKUP";
 * plus "<dir>:assets:<binding>", "<dir>:ai", "<dir>:browser" and "<dir>:observability" (Workers
 * logs) when set. A wrangler.toml is reported as "<dir>:toml" so a new format cannot slip past.
 */
export function scanBindings(): Found[] {
  const out: Found[] = [];
  for (const file of wranglerFiles()) {
    const dir = file.split('/').slice(-2, -1)[0]!;
    if (file.endsWith('.toml')) {
      out.push({ key: `${dir}:toml`, file });
      continue;
    }
    const cfg = parseJsonc(read(file)) as Record<string, unknown>;
    for (const list of BINDING_LISTS) {
      const v = cfg[list];
      const items = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { bindings?: unknown }).bindings) ? (v as { bindings: unknown[] }).bindings : [];
      for (const it of items as Array<Record<string, unknown>>) {
        out.push({ key: `${dir}:${list}:${String(it.binding ?? it.name ?? '?')}`, file });
      }
    }
    const assets = cfg.assets as { binding?: string } | undefined;
    if (assets) out.push({ key: `${dir}:assets:${assets.binding ?? 'ASSETS'}`, file });
    for (const single of ['ai', 'browser', 'images', 'version_metadata']) if (cfg[single]) out.push({ key: `${dir}:${single}`, file });
    const obs = cfg.observability as { enabled?: boolean } | undefined;
    if (obs?.enabled) out.push({ key: `${dir}:observability`, file });
    if (cfg.logpush) out.push({ key: `${dir}:logpush`, file });
  }
  return out;
}

/**
 * Every Android backup rule, as "<section>:<include|exclude>:<domain>:<path>", read from the rule
 * files the app ships (the config plugin's source of truth and the committed android/ copy), plus
 * "<file>:allowBackup:<value>" for each manifest that sets it.
 */
export function scanBackup(): Found[] {
  const out: Found[] = [];
  const ruleDirs = ['apps/mobile/plugins/backup-rules', 'apps/mobile/android/app/src/main/res/xml'];
  for (const dir of ruleDirs) {
    if (!existsSync(join(ROOT, dir))) continue;
    for (const name of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.xml'))) {
      const file = `${dir}/${name}`;
      const xml = read(file).replace(/<!--[\s\S]*?-->/g, '');
      if (!/<(full-backup-content|data-extraction-rules)/.test(xml)) continue;
      const sections: Array<[string, string]> = [];
      if (xml.includes('<full-backup-content')) sections.push(['full-backup', xml]);
      for (const s of ['cloud-backup', 'device-transfer']) {
        const m = new RegExp(`<${s}[^>]*>([\\s\\S]*?)</${s}>`).exec(xml);
        if (m) sections.push([s, m[1]!]);
      }
      for (const [section, body] of sections) {
        for (const m of body.matchAll(/<(include|exclude)\s+domain="([^"]+)"\s+path="([^"]*)"/g)) {
          out.push({ key: `${section}:${m[1]}:${m[2]}:${m[3]}`, file });
        }
      }
    }
  }
  const manifests = ['apps/mobile/android/app/src/main/AndroidManifest.xml', 'apps/mobile/android/wear/src/main/AndroidManifest.xml'];
  for (const file of manifests) {
    if (!existsSync(join(ROOT, file))) continue;
    const m = /android:allowBackup="([^"]+)"/.exec(read(file));
    if (m) out.push({ key: `${file.includes('/wear/') ? 'wear' : 'phone'}:allowBackup:${m[1]}`, file });
  }
  return out;
}

export function readRepoFile(rel: string): string {
  return read(rel);
}

export function repoFileExists(rel: string): boolean {
  return existsSync(join(ROOT, rel));
}

export function relToRoot(abs: string): string {
  return posix(relative(ROOT, abs));
}
