// Step A1b of the full system audit: source lists, by script.
// Run from anywhere:  node docs/system-map/_tools/sources.mjs
// Plain Node, no dependencies, reads the repo, writes only under docs/system-map/_sources and _work/T1b.md.
// Every output line is "kind | name | file:line". What the script cannot see is listed at the end of T1b.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'docs/system-map/_sources');
const WORK = path.join(ROOT, 'docs/system-map/_work');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

const AREA_MAX = 12000;
const CODE_EXT = /\.(ts|tsx|js|mjs|kt|sql|html|css)$/;
const SKIP_DIR = /^(node_modules|build|dist|\.gradle|__tests__|test|e2e|e2e-live|vendor)$/;
const TEST_FILE = /\.test\.|\.check\.mjs$|Test\.kt$|[\\/]src[\\/]test[\\/]/;

// ---------------------------------------------------------------- file helpers
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const abs = (r) => path.join(ROOT, r);
const exists = (r) => fs.existsSync(abs(r));
const cache = new Map();
function lines(r) {
  if (!cache.has(r)) cache.set(r, fs.readFileSync(abs(r), 'utf8').split(/\r?\n/));
  return cache.get(r);
}
/** Every non-test source file under a repo-relative folder. */
function walk(r, ext = CODE_EXT, out = []) {
  if (!exists(r)) return out;
  for (const e of fs.readdirSync(abs(r), { withFileTypes: true })) {
    const p = `${r}/${e.name}`;
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(e.name)) walk(p, ext, out);
    } else if (ext.test(e.name) && !TEST_FILE.test(p)) out.push(p);
  }
  return out.sort();
}
function dirs(r, out = []) {
  if (!exists(r)) return out;
  for (const e of fs.readdirSync(abs(r), { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIR.test(e.name)) {
      out.push(`${r}/${e.name}`);
      dirs(`${r}/${e.name}`, out);
    }
  }
  return out.sort();
}

// ---------------------------------------------------------------- the trees
const T = {
  panel: 'apps/dashboard/src',
  panelPublic: 'apps/dashboard/public',
  phone: 'apps/mobile/src',
  phoneModules: 'apps/mobile/modules',
  phoneNative: 'apps/mobile/android/app/src/main',
  watch: 'apps/mobile/android/wear/src/main',
  hq: 'apps/hq/public',
  wPanel: 'deploy/panel',
  wHq: 'deploy/hq',
  wGate: 'deploy/gate',
  mig: 'supabase/migrations',
  d1: 'deploy/panel/migrations',
  ci: '.github/workflows',
};
const F = {
  panel: walk(T.panel),
  panelPublic: walk(T.panelPublic),
  phone: walk(T.phone),
  phoneModules: walk(T.phoneModules),
  phoneNative: walk(T.phoneNative),
  watch: walk(T.watch),
  hq: walk(T.hq),
  wPanel: walk(T.wPanel).filter((f) => !f.startsWith(T.d1 + '/')),
  wHq: walk(T.wHq),
  wGate: walk(T.wGate),
  mig: walk(T.mig, /\.sql$/),
  d1: walk(T.d1, /\.sql$/),
  ci: walk(T.ci, /\.ya?ml$/),
};

// ---------------------------------------------------------------- collecting items
/** surface -> [{kind, name, file, line, probe}]  (probe = text that must sit on that line; used by the spot check) */
const items = {};
const seen = new Set();
function emit(surface, kind, name, file, line, probe, dedupeKey) {
  const key = `${surface}|${kind}|${dedupeKey ?? `${name}|${file}|${line}`}`;
  if (seen.has(key)) return;
  seen.add(key);
  (items[surface] ||= []).push({ kind, name: String(name).replace(/\s+/g, ' ').trim(), file, line, probe: probe ?? null });
}

// ---------------------------------------------------------------- constants (NAME = 'value'), to resolve channel ids, keys, task names
const consts = new Map(); // NAME -> [{value, file, line}]
const CONST_JS = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*(['"`])([^'"`$]*)\2/;
const CONST_ALIAS = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*([A-Z][A-Z0-9_]*)\s*;/;
const aliases = new Map(); // NAME -> OTHER_NAME
const CONST_KT = /(?:const\s+)?val\s+([A-Z][A-Z0-9_]*)\s*(?::\s*\w+)?\s*=\s*"([^"$]*)"/;
for (const f of [...F.panel, ...F.phone, ...F.phoneModules, ...F.phoneNative, ...F.watch, ...F.hq, ...F.wPanel, ...F.wHq, ...F.wGate]) {
  lines(f).forEach((l, i) => {
    const al = f.endsWith('.kt') ? null : CONST_ALIAS.exec(l);
    if (al) aliases.set(al[1], al[2]);
    const m = f.endsWith('.kt') ? CONST_KT.exec(l) : CONST_JS.exec(l);
    if (!m) return;
    const value = f.endsWith('.kt') ? m[2] : m[3];
    if (!consts.has(m[1])) consts.set(m[1], []);
    consts.get(m[1]).push({ value, file: f, line: i + 1 });
  });
}
/** A call argument -> its text. 'literal' stays; NAME is looked up (same file first, then a single repo-wide meaning). */
function resolve(arg, file) {
  arg = arg.trim();
  const lit = /^(['"`])([^'"`]*)\1$/.exec(arg);
  if (lit) return lit[2];
  const id = /^[A-Za-z_][A-Za-z0-9_.]*$/.exec(arg)?.[0];
  if (!id) return `${arg} (not a plain name: unknown)`;
  let key = id.split('.').pop();
  for (let hop = 0; hop < 3 && !consts.has(key) && aliases.has(key); hop++) key = aliases.get(key);
  const defs = consts.get(key);
  if (!defs) return `${id} (value unknown: built in code)`;
  const same = defs.find((d) => d.file === file);
  if (same) return `${same.value} [${id}]`;
  const values = [...new Set(defs.map((d) => d.value))];
  return values.length === 1 ? `${values[0]} [${id}]` : `${id} (several values: ${values.join(' / ')})`;
}
/** The first argument of a call that starts at column `at` on line i (looks at the next line when the call wraps). */
function firstArg(ls, i, at) {
  let rest = ls[i].slice(at);
  if (!rest.trim()) rest = (ls[i + 1] || '').trim();
  const m = /^\s*([^,)]+)/.exec(rest);
  return m ? m[1].trim() : '';
}

// ---------------------------------------------------------------- database: functions, tables, crons (also feeds the rpc lookups)
const dbFns = new Map(); // name -> {file, line, defs, droppedAt}
const dbTables = new Map();
const RE_FN = /create\s+(?:or\s+replace\s+)?function\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;
const RE_DROP_FN = /drop\s+function\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;
const RE_TABLE = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;
const RE_VIEW = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;
const RE_TRIGGER = /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([a-z_][a-z0-9_]*)"?/i;
const isSqlComment = (l) => /^\s*--/.test(l);
for (const f of F.mig) {
  const ls = lines(f);
  ls.forEach((l, i) => {
    if (isSqlComment(l)) return;
    let m;
    if ((m = RE_FN.exec(l))) {
      const prev = dbFns.get(m[1]);
      dbFns.set(m[1], { file: f, line: i + 1, defs: (prev?.defs || 0) + 1, dropped: null });
    }
    if ((m = RE_DROP_FN.exec(l)) && dbFns.has(m[1])) dbFns.get(m[1]).dropped = { file: f, line: i + 1 };
    if ((m = RE_TABLE.exec(l)) && !dbTables.has(m[1])) {
      dbTables.set(m[1], { file: f, line: i + 1 });
    }
    if ((m = RE_VIEW.exec(l))) emit('server', 'db-view', m[1], f, i + 1, m[1]);
    if ((m = RE_TRIGGER.exec(l))) emit('server', 'db-trigger', m[1], f, i + 1, m[1], `${m[1]}|${f}`);
    if (/cron\.schedule\s*\(/i.test(l)) {
      const near = ls.slice(i, i + 4).join(' ');
      const a = /cron\.schedule\s*\(\s*'([^']*)'\s*,\s*'([^']*)'/i.exec(near);
      emit('server', 'cron-db', a ? `${a[1]} @ ${a[2]}` : 'cron.schedule (arguments unknown)', f, i + 1, 'cron.schedule');
    }
  });
}
for (const [name, d] of [...dbFns].sort()) {
  const gone = d.dropped ? ` dropped-later-at=${path.basename(d.dropped.file)}:${d.dropped.line}` : '';
  emit('server', 'db-function', `${name} (defined ${d.defs}x, newest shown${gone})`, d.file, d.line, name);
}
for (const [name, d] of [...dbTables].sort()) emit('server', 'db-table', name, d.file, d.line, name);
const d1Tables = new Map();
for (const f of F.d1) {
  lines(f).forEach((l, i) => {
    const m = isSqlComment(l) ? null : RE_TABLE.exec(l);
    if (m && !d1Tables.has(m[1])) {
      d1Tables.set(m[1], { file: f, line: i + 1 });
      emit('server', 'd1-table', m[1], f, i + 1, m[1]);
    }
  });
}

// ---------------------------------------------------------------- readers: .from( / .rpc( / names of database functions used as text
const readers = []; // {type: 'rpc'|'table'|'storage'|'d1', name, how, file, line}
const RE_STR = /(['"`])([a-z][a-z0-9_]*_[a-z0-9_]*)\1/g;
function scanReaders(files, surface) {
  for (const f of files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(f)) continue;
    const ls = lines(f);
    ls.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      const direct = new Set();
      for (const m of l.matchAll(/\.(rpc|from)\(/g)) {
        if (m[1] === 'from' && /(Array|Uint8Array|Uint16Array|Uint32Array|Float32Array|Buffer|Object|Set|Map|Int8Array)\s*$/.test(l.slice(0, m.index))) continue;
        const arg = firstArg(ls, i, m.index + m[0].length);
        const name = resolve(arg, f);
        const storage = m[1] === 'from' && /storage\s*$|storage\s*\.\s*$/.test(l.slice(0, m.index).replace(/\s+$/, '') + (ls[i - 1] || '').trim().slice(-8) ? l.slice(0, m.index) : '') ;
        const isStorage = m[1] === 'from' && (/storage\s*$/.test(l.slice(0, m.index)) || /storage\s*$/.test((ls[i - 1] || '').trim()) || /BUCKET/.test(arg));
        void storage;
        const type = m[1] === 'rpc' ? 'rpc' : isStorage ? 'storage' : 'table';
        const plain = name.split(' ')[0];
        direct.add(plain);
        readers.push({ type, name, how: `.${m[1]}( call`, file: f, line: i + 1 });
        emit(surface, `${m[1]}-call`, name, f, i + 1, `.${m[1]}(`);
      }
      for (const m of l.matchAll(/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)/g)) {
        if (!m[1] && m[2] === 'rpc') continue;
        direct.add(m[2]);
        readers.push({ type: m[1] ? 'rpc' : 'table', name: m[2], how: 'REST address', file: f, line: i + 1 });
        emit(surface, m[1] ? 'rpc-call' : 'from-call', `${m[2]} (REST address)`, f, i + 1, m[2]);
      }
      for (const m of l.matchAll(RE_STR)) {
        if (!dbFns.has(m[2]) || direct.has(m[2])) continue;
        direct.add(m[2]);
        readers.push({ type: 'rpc', name: m[2], how: 'name passed to a wrapper', file: f, line: i + 1 });
        emit(surface, 'rpc-name', m[2], f, i + 1, m[2]);
      }
      if (d1Tables.size && /\b(select|insert|update|delete)\b/i.test(l)) {
        for (const m of l.matchAll(/\b(?:from|into|update|join)\s+([a-z_][a-z0-9_]*)/gi)) {
          if (!d1Tables.has(m[1])) continue;
          readers.push({ type: 'd1', name: m[1], how: 'SQL text', file: f, line: i + 1 });
          emit(surface, 'd1-sql', m[1], f, i + 1, m[1], `${m[1]}|${f}|${i + 1}`);
        }
      }
    });
  }
}

// ---------------------------------------------------------------- shared: sheets, screens, local storage
const RE_OVERLAY = /(?:function|const|class)\s+([A-Z]\w*(?:Sheet|Dialog|Drawer|Modal))\b\s*(?:[=(<:]|extends)/;
const RE_SCREEN_FN = /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*Screen)\s*\(/;
function scanComponents(files, surface) {
  for (const f of files) {
    if (!/\.(tsx|ts)$/.test(f)) continue;
    lines(f).forEach((l, i) => {
      let m;
      if ((m = RE_OVERLAY.exec(l))) emit(surface, 'overlay', m[1], f, i + 1, m[1]);
      if ((m = RE_SCREEN_FN.exec(l))) emit(surface, 'screen-component', m[1], f, i + 1, m[1]);
    });
  }
}

// ================================================================ PANEL
for (const d of [T.panel, ...dirs(T.panel)]) emit('panel', 'folder', d, d, 0, null);
for (const f of F.panel.filter((x) => x.startsWith(`${T.panel}/crm/ui/screens/`))) emit('panel', 'screen-file', path.basename(f), f, 1, null);
scanComponents(F.panel, 'panel');
{
  // The real router: CrmApp.tsx (menu = `path: '/x'`, pages = the switch in Screen()).
  const f = `${T.panel}/crm/CrmApp.tsx`;
  if (exists(f)) {
    const ls = lines(f);
    let inScreen = false;
    let head = null;
    ls.forEach((l, i) => {
      for (const m of l.matchAll(/\bpath:\s*'([^']+)'/g)) emit('panel', 'menu-item', m[1], f, i + 1, m[1]);
      if (/^function Screen\(/.test(l)) inScreen = true;
      if (!inScreen) {
        const t = /head === '([^']+)'(?:\s*&&\s*id === '([^']+)')?/.exec(l);
        if (t) emit('panel', 'route-title', `/${t[1]}${t[2] ? '/' + t[2] : ''}`, f, i + 1, t[1]);
        return;
      }
      let m;
      if ((m = /^\s*case '([^']+)':/.exec(l))) {
        head = m[1];
        emit('panel', 'route', `/${head}`, f, i + 1, head);
      } else if (/^\s*case undefined:/.test(l)) {
        head = '';
        emit('panel', 'route', '/', f, i + 1, 'undefined');
      } else if (/^\s*default:/.test(l)) {
        head = '*';
        emit('panel', 'route', '(any other address)', f, i + 1, 'default');
      }
      for (const s of l.matchAll(/\bid === '([^']+)'(?:\s*&&\s*segments\[2\] === '([^']+)')?/g)) {
        if (head !== null) emit('panel', 'route', `/${head}/${s[1]}${s[2] ? '/' + s[2] : ''}`, f, i + 1, s[1]);
      }
      for (const s of l.matchAll(/<Redirect to="([^"]+)"/g)) emit('panel', 'redirect', `/${head ?? ''} -> ${s[1]}`, f, i + 1, s[1]);
    });
  }
  // Tabs inside a screen: `type Tab = 'a' | 'b'` and friends.
  for (const g of F.panel) {
    lines(g).forEach((l, i) => {
      const m = /^\s*(?:export\s+)?type\s+(\w*(?:Tab|Section|Step|View)\w*)\s*=\s*((?:'[^']+'\s*\|?\s*)+);?\s*$/.exec(l);
      if (m) emit('panel', 'tab-type', `${m[1]} = ${m[2].replace(/\s+/g, ' ').trim()}`, g, i + 1, m[1]);
      for (const k of l.matchAll(/localStorage\.(?:setItem|removeItem)\(\s*([^,)]+)/g)) emit('panel', 'local-key', resolve(k[1], g), g, i + 1, 'localStorage');
    });
  }
}
scanReaders(F.panel, 'panel');

// ================================================================ PHONE
{
  const appDir = `${T.phone}/app`; // expo-router: one file = one screen
  for (const f of F.phone.filter((x) => x.startsWith(appDir + '/'))) {
    const r = f.slice(appDir.length).replace(/\.tsx?$/, '');
    const base = path.basename(r);
    const route = r.replace(/\/\([^)]+\)/g, '').replace(/\/index$/, '') || '/';
    emit('phone', base === '_layout' ? 'layout-file' : base.startsWith('+') ? 'special-file' : 'screen-file', route, f, 1, null);
  }
  scanComponents(F.phone, 'phone');
  const phoneAll = [...F.phone, ...F.phoneModules, ...F.phoneNative];
  for (const f of phoneAll) {
    const ls = lines(f);
    const hasPersist = ls.some((l) => /\bpersist\(/.test(l));
    ls.forEach((l, i) => {
      const t = l.trim();
      const comment = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
      let m;
      // deep links are named in comments too, so look before skipping comments
      for (const d of l.matchAll(/\b(forgeai|mettleup):\/\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)/gi)) {
        emit('phone', 'deeplink-custom', `${d[1]}://${d[2]}`, f, i + 1, `${d[1]}://${d[2]}`, `${d[1]}://${d[2]}`);
      }
      if (comment) return;
      for (m of l.matchAll(/setNotificationChannelAsync\(/g)) {
        emit('phone', 'channel', resolve(firstArg(ls, i, m.index + m[0].length), f), f, i + 1, 'setNotificationChannelAsync');
      }
      for (m of l.matchAll(/\bNotificationChannel(?:Compat\.Builder)?\(/g)) {
        emit('phone', 'channel-native', resolve(firstArg(ls, i, m.index + m[0].length), f), f, i + 1, 'NotificationChannel');
      }
      for (m of l.matchAll(/\b(defineTask|registerTaskAsync|unregisterTaskAsync|registerHeadlessTask)\(/g)) {
        emit('phone', 'task', `${resolve(firstArg(ls, i, m.index + m[0].length), f)} (${m[1]})`, f, i + 1, m[1]);
      }
      if ((m = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*[^{]*\b(\w*(?:Service|Worker|BroadcastReceiver|AppWidgetProvider|Activity))\b/.exec(l)) && f.endsWith('.kt')) {
        emit('phone', 'native-component', `${m[1]} : ${m[2]}`, f, i + 1, m[1]);
      }
      for (m of l.matchAll(/AsyncStorage\.(setItem|multiSet|mergeItem|removeItem|getItem)\(/g)) {
        const key = resolve(firstArg(ls, i, m.index + m[0].length), f);
        emit('phone', m[1] === 'getItem' ? 'storage-read' : m[1] === 'removeItem' ? 'storage-remove' : 'storage-write', key, f, i + 1, 'AsyncStorage');
      }
      for (m of l.matchAll(/SecureStore\.(setItemAsync|deleteItemAsync)\(/g)) {
        emit('phone', 'secure-write', resolve(firstArg(ls, i, m.index + m[0].length), f), f, i + 1, 'SecureStore');
      }
      if (hasPersist && (m = /^\s*name:\s*(['"])([^'"]+)\1/.exec(l))) emit('phone', 'storage-store', `${m[2]} (zustand persist)`, f, i + 1, m[2]);
      if ((m = /getSharedPreferences\(\s*([^,)]+)/.exec(l))) emit('phone', 'native-prefs', resolve(m[1], f), f, i + 1, 'getSharedPreferences');
      if (/\.(ts|tsx)$/.test(f) && (m = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*(?:_KEY|_KEYS|STORAGE\w*))\s*(?::[^=]+)?=\s*(['"`])([^'"`]*)\2/.exec(l))) {
        emit('phone', 'storage-key-const', `${m[3]} [${m[1]}]`, f, i + 1, m[1]);
      }
    });
  }
  // deep links the system opens the app for
  const appJson = 'apps/mobile/app.json';
  if (exists(appJson)) {
    lines(appJson).forEach((l, i) => {
      let m;
      if ((m = /"scheme":\s*(\[[^\]]*\]|"[^"]*")/.exec(l)) && !/"host"/.test(l)) emit('phone', 'deeplink-scheme', m[1], appJson, i + 1, 'scheme');
      if ((m = /"scheme":\s*"([^"]+)",\s*"host":\s*"([^"]+)"(?:,\s*"pathPrefix":\s*"([^"]+)")?/.exec(l))) {
        emit('phone', 'deeplink-web', `${m[1]}://${m[2]}${m[3] || ''}`, appJson, i + 1, m[2]);
      }
    });
  }
  const man = `${T.phoneNative}/AndroidManifest.xml`;
  if (exists(man)) {
    lines(man).forEach((l, i) => {
      let m;
      if ((m = /<data\s+android:scheme="([^"]+)"(?:\s+android:host="([^"]+)")?(?:\s+android:pathPrefix="([^"]+)")?/.exec(l))) {
        emit('phone', 'deeplink-manifest', `${m[1]}://${m[2] || ''}${m[3] || ''}`, man, i + 1, 'android:scheme');
      }
      if ((m = /<(activity|service|receiver|provider)\b[^>]*android:name="([^"]+)"/.exec(l))) emit('phone', `manifest-${m[1]}`, m[2], man, i + 1, m[2]);
    });
  }
  for (const mf of walk(T.phoneModules, /AndroidManifest\.xml$/)) {
    const ls = lines(mf);
    ls.forEach((l, i) => {
      const tag = /<(activity|service|receiver|provider)\b/.exec(l);
      if (!tag) return;
      const near = ls.slice(i, i + 4).join(' ');
      const n = /android:name="([^"]+)"/.exec(near);
      emit('phone', `manifest-${tag[1]}`, n ? n[1] : 'name unknown', mf, i + 1, `<${tag[1]}`);
    });
  }
  scanReaders(F.phone, 'phone');
}

// ================================================================ WATCH
{
  const man = `${T.watch}/AndroidManifest.xml`;
  if (exists(man)) {
    const ls = lines(man);
    ls.forEach((l, i) => {
      const tag = /<(activity|service|receiver|provider)\b/.exec(l);
      if (tag) {
        let end = i;
        while (end < ls.length - 1 && !/<\/(activity|service|receiver|provider)>|\/>\s*$/.test(ls[end])) end++;
        const block = ls.slice(i, end + 1).join(' ');
        const n = /android:name="([^"]+)"/.exec(block);
        let kind = tag[1];
        if (/BIND_TILE_PROVIDER|TileService/.test(block)) kind = 'tile';
        if (/COMPLICATION/.test(block)) kind = 'complication';
        emit('watch', kind, `${n ? n[1] : 'name unknown'} (manifest)`, man, i + 1, `<${tag[1]}`);
      }
      const p = /android:path(?:Prefix)?="([^"]+)"/.exec(l);
      if (p) emit('watch', 'wear-message-path', p[1], man, i + 1, p[1]);
      const perm = /<uses-permission[^>]*android:name="([^"]+)"/.exec(l);
      if (perm) emit('watch', 'permission', perm[1], man, i + 1, perm[1]);
    });
  }
  for (const f of F.watch.filter((x) => x.endsWith('.kt'))) {
    const ls = lines(f);
    ls.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      let m;
      if ((m = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*[^{]*?\b(\w*(?:TileService|ComplicationDataSourceService|ComplicationProviderService))\b/.exec(l))) {
        emit('watch', /Tile/.test(m[2]) ? 'tile' : 'complication', `${m[1]} : ${m[2]}`, f, i + 1, m[1]);
      } else if ((m = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*[^{]*?\b(\w*Activity)\b/.exec(l))) {
        emit('watch', 'activity', `${m[1]} : ${m[2]}`, f, i + 1, m[1]);
      } else if ((m = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*[^{]*?\b(\w*Service)\b/.exec(l))) {
        emit('watch', 'service', `${m[1]} : ${m[2]}`, f, i + 1, m[1]);
      } else if ((m = /class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*[^{]*?\b(\w*Receiver)\b/.exec(l))) {
        emit('watch', 'receiver', `${m[1]} : ${m[2]}`, f, i + 1, m[1]);
      }
      if (/@Composable/.test(l) || /@Composable/.test(ls[i - 1] || '')) {
        const c = /fun\s+([A-Z]\w*(?:Screen|Page|Card|Dialog|Sheet))\s*\(/.exec(l);
        if (c) emit('watch', 'composable-screen', c[1], f, i + 1, c[1]);
      }
      for (m of l.matchAll(/\bNotificationChannel\(/g)) emit('watch', 'channel', resolve(firstArg(ls, i, m.index + m[0].length), f), f, i + 1, 'NotificationChannel');
      if ((m = /getSharedPreferences\(\s*([^,)]+)/.exec(l))) emit('watch', 'prefs', resolve(m[1], f), f, i + 1, 'getSharedPreferences');
    });
  }
}

// ================================================================ SERVER (routes, crons). Functions and tables were added above.
function scanRoutes(files, surface, kindPrefix = '') {
  for (const f of files) {
    if (!/\.(js|ts|mjs)$/.test(f) || f.endsWith('.d.ts')) continue;
    lines(f).forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      for (const m of l.matchAll(/(['"`])((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/[^'"`]*)\1/g)) {
        emit(surface, `${kindPrefix}route`, m[2], f, i + 1, m[2], `${m[2]}|${f}`);
      }
      const routeLine = /pathname|\bpath\b|\broute\b|PREFIX|startsWith\(|endsWith\(|asset:|PUBLIC_FILES|redirect\(|\.exec\(|\.test\(|^\s*['"]\/[^'"]*['"]\s*:/.test(l);
      if (!routeLine) return;
      for (const m of l.matchAll(/(['"`])(\/[A-Za-z0-9_\-./:${}]*)\1/g)) {
        if (m[2] === '/' && !/pathname === '\/'|path === '\/'/.test(l)) continue;
        if (/^\/\/|^\/\$\{/.test(m[2])) continue;
        emit(surface, `${kindPrefix}route`, m[2], f, i + 1, m[2], `${m[2]}|${f}`);
      }
      for (const m of l.matchAll(/\/\^((?:\\\/|[^/\n])+)\$?\/[a-z]*\s*(?:\.(?:exec|test)\(|[,\]])/g)) {
        if (!m[1].startsWith('\\/')) continue;
        emit(surface, `${kindPrefix}route-pattern`, `^${m[1]}`, f, i + 1, m[1].slice(0, 12), `${m[1]}|${f}`);
      }
    });
  }
}
scanRoutes(F.wPanel, 'server');
scanRoutes(F.wHq, 'server');
scanRoutes(F.wGate, 'server');
for (const w of ['deploy/panel/wrangler.jsonc', 'deploy/hq/wrangler.jsonc', 'deploy/gate/wrangler.jsonc']) {
  if (!exists(w)) continue;
  let any = false;
  lines(w).forEach((l, i) => {
    const off = /^\s*\/\//.test(l);
    const c = /"crons":\s*\[([^\]]*)\]/.exec(l);
    if (c) {
      for (const one of c[1].matchAll(/"([^"]+)"/g)) {
        any = true;
        emit('server', off ? 'cron-worker-commented-out' : 'cron-worker', `${one[1]} (${w.split('/')[1]} Worker, UTC)`, w, i + 1, one[1]);
      }
    }
    const p = /"pattern":\s*"([^"]+)"/.exec(l);
    if (p) emit('server', off ? 'host-commented-out' : 'host', `${p[1]} (${w.split('/')[1]} Worker)`, w, i + 1, p[1]);
  });
  if (!any) emit('server', 'cron-worker-none', `no crons in ${w}`, w, 0, null);
}
for (const f of F.ci) {
  lines(f).forEach((l, i) => {
    const c = /^\s*-\s*cron:\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/.exec(l);
    if (c) emit('server', 'cron-github', `${c[1]} (${path.basename(f)}, UTC)`, f, i + 1, c[1]);
  });
}
if (![...(items.server || [])].some((x) => x.kind === 'cron-db')) emit('server', 'cron-db-none', 'no cron.schedule( in supabase/migrations', T.mig, 0, null);
scanReaders([...F.wPanel, ...F.wHq, ...F.wGate], 'server');

// ================================================================ HQ
{
  for (const f of F.hq) {
    const ls = lines(f);
    ls.forEach((l, i) => {
      let m;
      if (f.endsWith('.html')) {
        for (m of l.matchAll(/<a\b[^>]{0,80}?href="#([a-z][a-z0-9/-]*)"/g)) emit('hq', 'menu-link', `#${m[1]}`, f, i + 1, `#${m[1]}`, `#${m[1]}`);
        for (m of l.matchAll(/<(section|main|nav|dialog)\b[^>]*\bid="([^"]+)"/g)) emit('hq', 'page-part', `${m[1]}#${m[2]}`, f, i + 1, m[2]);
        return;
      }
      if (!/\.(js|mjs)$/.test(f)) return;
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if ((m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+Page)\s*\(/.exec(l))) emit('hq', 'screen', m[1], f, i + 1, m[1]);
      if ((m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+(?:Card|Section|Dialog|Sheet|Banner))\s*\(/.exec(l))) emit('hq', 'section', m[1], f, i + 1, m[1]);
      for (m of l.matchAll(/\bh\(\s*'(h1|h2|h3)'\s*,\s*[^,]*,\s*(['"`])([^'"`]+)\2/g)) emit('hq', 'heading', `${m[1]}: ${m[3]}`, f, i + 1, m[3].slice(0, 15));
      for (m of l.matchAll(/\b(?:api|fetch)\(\s*(['"`])(\/[^'"`?]*)/g)) emit('hq', 'api-call', m[2].replace(/\$\{[^}]*\}?$/, ''), f, i + 1, m[2].slice(0, 12));
      if (/^const ROUTES\s*=/.test(l)) for (m of l.matchAll(/[{,]\s*([a-z][a-z0-9-]*):/g)) emit('hq', 'route', `#${m[1]}`, f, i + 1, m[1]);
      if (/\.exec\(hash\)/.test(l) && (m = /\/\^([a-z]+)/.exec(l))) emit('hq', 'route', `#${m[1]}/<id>`, f, i + 1, m[1]);
      for (m of l.matchAll(/localStorage\.(?:setItem|removeItem)\(\s*([^,)]+)/g)) emit('hq', 'local-key', resolve(m[1], f), f, i + 1, 'localStorage');
    });
  }
  scanReaders(F.hq, 'hq');
}

// ================================================================ WORDS (templates and What's new, by name / version only)
{
  const tpl = `${T.panel}/crm/logic/messageTemplates.ts`;
  if (exists(tpl)) {
    let inList = null;
    lines(tpl).forEach((l, i) => {
      const s = /export const (\w+_TEMPLATES)\b/.exec(l);
      if (s) inList = s[1];
      if (/^\];/.test(l)) inList = null;
      const m = inList && /^\s*(?:\{\s*)?id:\s*'([^']+)'/.exec(l);
      if (m) emit('words', inList === 'PERSONAL_TEMPLATES' ? 'template-whatsapp-personal' : 'template-broadcast', m[1], tpl, i + 1, m[1]);
    });
  }
  const news = [
    [`${T.panel}/crm/logic/whatsNew.ts`, 'ADMIN_NEWS', /^\s{2,4}id:\s*'([^']+)'/, 'whatsnew-panel'],
    [`${T.phone}/lib/whatsNew.ts`, 'WHATS_NEW_LOG', /^\s{2,4}version:\s*'([^']+)'/, 'whatsnew-phone'],
  ];
  for (const [f, list, re, kind] of news) {
    if (!exists(f)) continue;
    let inList = false;
    lines(f).forEach((l, i) => {
      if (new RegExp(`export const ${list}\\b`).test(l)) inList = true;
      else if (inList && /^\];/.test(l)) inList = false;
      const m = inList && re.exec(l);
      if (m) emit('words', kind, m[1], f, i + 1, m[1]);
    });
  }
  const all = [...F.panel, ...F.phone, ...F.phoneModules, ...F.watch, ...F.hq, ...F.wPanel, ...F.wHq, ...F.wGate];
  const enclosing = (ls, i) => {
    for (let k = i; k >= 0 && k > i - 80; k--) {
      const m = /(?:function\s+(\w+)\s*\(|(?:const|val)\s+(\w+)\s*=\s*(?:async\s*)?\(|fun\s+(\w+)\s*\()/.exec(ls[k]);
      if (m) return m[1] || m[2] || m[3];
    }
    return 'function unknown';
  };
  for (const f of all) {
    const ls = lines(f);
    const waFile = /whatsapp|wa\.me/i.test(path.basename(f)) || ls.some((l) => /wa\.me\//.test(l));
    ls.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      let m;
      if (/wa\.me\/|api\.whatsapp\.com/.test(l)) emit('words', 'whatsapp-link-built-here', enclosing(ls, i), f, i + 1, 'wa');
      if (/graph\.facebook\.com/.test(l)) emit('words', 'whatsapp-cloud-send', enclosing(ls, i), f, i + 1, 'graph.facebook.com');
      if ((m = /(?:const|let)\s+(\w*TEMPLATE\w*)\s*=\s*(['"])([^'"]+)\2/.exec(l)) && /whatsapp|phone/i.test(f)) emit('words', 'whatsapp-cloud-template', `${m[3]} [${m[1]}]`, f, i + 1, m[3]);
      if (/mailto:/.test(l)) emit('words', 'email-link-built-here', enclosing(ls, i), f, i + 1, 'mailto:');
      if (/fcm\.googleapis\.com/.test(l)) emit('words', 'push-fcm-send', enclosing(ls, i), f, i + 1, 'fcm.googleapis.com');
      if (/scheduleNotificationAsync\(/.test(l)) emit('words', 'phone-notification', enclosing(ls, i), f, i + 1, 'scheduleNotificationAsync');
      if ((m = /\.setContentTitle\(\s*("([^"]*)"|[^)]+)\)/.exec(l))) emit('words', f.startsWith(T.watch) ? 'watch-notification' : 'phone-native-notification', m[2] ?? `${enclosing(ls, i)} (title built in code)`, f, i + 1, 'setContentTitle');
      if ((m = /^(?:export\s+)?(?:async\s+)?function\s+(\w*(?:fcm\w*Message|PushMessage|pushPayload|PushPayload|webPush\w*|sendWebPush|notePayload)\w*)\s*\(/.exec(l)) && /deploy\//.test(f)) {
        emit('words', 'push-builder', m[1], f, i + 1, m[1]);
      }
      if (waFile && (m = /^export\s+(?:async\s+)?function\s+(\w*(?:Message|Words|Text|Wording|Link|Reminder|Wish|Invite)\w*)\s*\(/.exec(l))) {
        emit('words', 'message-builder', m[1], f, i + 1, m[1]);
      }
      if ((m = /\bwaKind\b.*?=\s*((?:'[^']+'\s*\|?\s*)+)/.exec(l)) && /type\s/.test(l)) emit('words', 'whatsapp-kind-type', m[1].trim(), f, i + 1, 'waKind');
    });
  }
  for (const f of F.ci.filter((x) => /whatsapp/.test(x))) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/message_templates\?name=([a-z_]+)/g)) emit('words', 'whatsapp-cloud-template', `${m[1]} (checked by ${path.basename(f)})`, f, i + 1, m[1]);
    });
  }
}

// ================================================================ write the source lists
const SURFACES = ['panel', 'phone', 'watch', 'server', 'hq', 'words'];
const counts = {};
for (const s of SURFACES) {
  const list = (items[s] || []).slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.line - b.line);
  items[s] = list;
  counts[s] = {};
  for (const it of list) counts[s][it.kind] = (counts[s][it.kind] || 0) + 1;
  fs.writeFileSync(path.join(OUT, `${s}.txt`), list.map((it) => `${it.kind} | ${it.name} | ${it.file}:${it.line}`).join('\n') + '\n');
}

// readers-raw.txt, grouped by table / function
readers.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.file.localeCompare(b.file) || a.line - b.line);
{
  const out = ['# Every .from(<table>) and .rpc(<function>) call, grouped. Format: type | name | file:line | how it was found', '# rpc "name passed to a wrapper" = a quoted name of a real database function, outside a literal .rpc( call (most calls go through wrappers).'];
  let last = '';
  for (const r of readers) {
    const head = `${r.type} ${r.name.split(' ')[0]}`;
    if (head !== last) out.push('', `## ${head}`);
    last = head;
    out.push(`${r.type} | ${r.name} | ${r.file}:${r.line} | ${r.how}`);
  }
  const used = new Set(readers.filter((r) => r.type === 'rpc').map((r) => r.name.split(' ')[0]));
  const unused = [...dbFns.keys()].filter((n) => !used.has(n)).sort();
  out.push('', `## database functions with no caller found in app or Worker code (${unused.length}): may be triggers, helpers called from SQL, or dead`, ...unused.map((n) => `no-caller | ${n} | ${dbFns.get(n).file}:${dbFns.get(n).line} | newest definition`));
  fs.writeFileSync(path.join(OUT, 'readers-raw.txt'), out.join('\n') + '\n');
}

// ================================================================ sizes.csv
const lineCount = (f) => {
  const ls = lines(f);
  return ls[ls.length - 1] === '' ? ls.length - 1 : ls.length;
};
const TREES = [
  [T.panel, F.panel], [T.panelPublic, F.panelPublic], [T.phone, F.phone], [T.phoneModules, F.phoneModules], [T.phoneNative, F.phoneNative],
  ['apps/mobile/android/wear', F.watch], [T.hq, F.hq], [T.wPanel, [...F.wPanel, ...F.d1]], [T.wHq, F.wHq], [T.wGate, F.wGate], [T.mig, F.mig], [T.ci, F.ci],
];
{
  const rows = ['folder,files,lines'];
  for (const [tree, files] of TREES) {
    const by = new Map();
    for (const f of files) {
      const parts = f.slice(tree.length + 1).split('/');
      const key = parts.length > 2 ? `${tree}/${parts[0]}/${parts[1]}` : parts.length === 2 ? `${tree}/${parts[0]} (files directly inside)` : `${tree} (files directly inside)`;
      const cur = by.get(key) || [0, 0];
      by.set(key, [cur[0] + 1, cur[1] + lineCount(f)]);
    }
    let tf = 0;
    let tl = 0;
    for (const [k, v] of [...by].sort()) {
      rows.push(`"${k}",${v[0]},${v[1]}`);
      tf += v[0];
      tl += v[1];
    }
    rows.push(`"TOTAL ${tree}",${tf},${tl}`);
  }
  fs.writeFileSync(path.join(OUT, 'sizes.csv'), rows.join('\n') + '\n');
}

// ================================================================ areas.json (a proposal for step A2)
// Each rule = one area: a list of folder prefixes (or exact files). First rule to match a file wins.
// An area over 12,000 lines is cut into numbered parts along the sorted file list.
const WEB_FILES = ['gymPage.js', 'gymPageServe.js', 'gymPage.d.ts', 'helpPages.js', 'helpArticles.js', 'joinPay.js', 'selfJoin.js', 'friend.js', 'hosts.js', 'appLink.js', 'pageChat.js', 'leads.js', 'whatsNewFeed.js'].map((x) => `${T.wPanel}/${x}`);
const P = T.panel;
const M = T.phone;
const RULES = [
  ['web/pages', 'web', [...WEB_FILES, T.panelPublic]],
  ['panel/screens', 'panel', [`${P}/crm/ui/screens`]],
  ['panel/forms', 'panel', [`${P}/crm/ui/forms`]],
  ['panel/ui-shell', 'panel', [`${P}/crm/ui`]],
  ['panel/logic', 'panel', [`${P}/crm/logic`]],
  ['panel/shop', 'panel', [`${P}/crm/shop`]],
  ['panel/assistant', 'panel', [`${P}/crm/assistant`]],
  ['panel/auth-data', 'panel', [`${P}/crm/auth`, `${P}/crm/data`]],
  ['panel/pay-machines', 'panel', [`${P}/crm/pay`, `${P}/crm/machines`, `${P}/crm/branches`, `${P}/crm/plan`, `${P}/crm/demo`, `${P}/crm/move`]],
  ['panel/brand-shell', 'panel', [P]],
  ['phone/screens', 'phone', [`${M}/app`]],
  ['phone/shop', 'phone', [`${M}/shop`]],
  ['phone/tracker-services', 'phone', [`${M}/tracker/services`]],
  ['phone/tracker-components', 'phone', [`${M}/tracker/components`]],
  ['phone/tracker-engine', 'phone', [`${M}/tracker/engine`, `${M}/tracker/plans`, `${M}/tracker/clips`]],
  ['phone/tracker-data', 'phone', [`${M}/tracker/db`, `${M}/tracker/store`]],
  ['phone/tracker-lib', 'phone', [`${M}/tracker/catalog`, `${M}/tracker/lib`, `${M}/tracker/share`]],
  ['phone/native', 'phone', [`${M}/tracker/phone`, T.phoneModules, T.phoneNative]],
  ['phone/components', 'phone', [`${M}/components`]],
  ['phone/cloud-backup-ai', 'phone', [`${M}/ai`, `${M}/backup`, `${M}/cloud`]],
  ['phone/onboarding-db', 'phone', [`${M}/onboarding`, `${M}/db`, `${M}/store`, `${M}/theme`]],
  ['phone/lib-core', 'phone', [M]],
  ['watch/app', 'watch', [T.watch]],
  ['hq/app', 'hq', [T.hq]],
  ['server/panel-worker', 'server', [T.wPanel]],
  ['server/hq-gate-workers', 'server', [T.wHq, T.wGate]],
  ['server/database', 'server', [T.mig]],
  ['server/ci-workflows', 'server', [T.ci]],
];
const allFiles = [...new Set(TREES.flatMap(([, files]) => files))].sort();
const areaFiles = new Map(RULES.map((r) => [r[0], []]));
const unplaced = [];
for (const f of allFiles) {
  const rule = RULES.find((r) => r[2].some((p) => f === p || f.startsWith(p + '/')));
  if (rule) areaFiles.get(rule[0]).push(f);
  else unplaced.push(f);
}
const fileArea = new Map();
const areas = [];
const folderOf = (f) => path.posix.dirname(f);
for (const [id, surface] of RULES) {
  const files = areaFiles.get(id);
  const total = files.reduce((n, f) => n + lineCount(f), 0);
  // Even parts: start with the fewest that could fit, add one until no part is over the limit or left as a crumb.
  let chunks = [];
  for (let parts = Math.max(1, Math.ceil(total / AREA_MAX)); parts < 20; parts++) {
    const target = total / parts;
    chunks = [];
    let cur = [];
    let n = 0;
    for (const f of files) {
      const c = lineCount(f);
      if (cur.length && chunks.length < parts - 1 && n + c / 2 > target) {
        chunks.push(cur);
        cur = [];
        n = 0;
      }
      cur.push(f);
      n += c;
    }
    if (cur.length) chunks.push(cur);
    if (chunks.every((ch) => ch.reduce((x, f) => x + lineCount(f), 0) <= AREA_MAX)) break;
  }
  chunks.forEach((chunk, k) => {
    const aid = chunks.length > 1 ? `${id}-${k + 1}` : id;
    const folders = [...new Set(chunk.map(folderOf))].sort();
    const cl = chunk.reduce((x, f) => x + lineCount(f), 0);
    for (const f of chunk) fileArea.set(f, aid);
    areas.push({
      id: aid,
      surface,
      folders,
      files: chunk.length,
      firstFile: chunk[0],
      lastFile: chunk[chunk.length - 1],
      lines: cl,
      overLimit: cl > AREA_MAX,
      sourceListLines: 0,
    });
  });
}
for (const s of SURFACES) {
  for (const it of items[s]) {
    let a = fileArea.get(it.file);
    if (!a && it.line === 0) {
      // a folder line: give it to the area that holds most of that folder's files
      const tally = {};
      for (const [f, id] of fileArea) if (f.startsWith(it.file + '/')) tally[id] = (tally[id] || 0) + 1;
      a = Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0];
    }
    const area = areas.find((x) => x.id === a);
    if (area) area.sourceListLines++;
  }
}
fs.writeFileSync(
  path.join(OUT, 'areas.json'),
  JSON.stringify(
    {
      _note: 'Step A1b proposal for A2, made by docs/system-map/_tools/sources.mjs. One area = at most 12,000 non-test source lines. A numbered area (-1, -2) is one folder group cut along its sorted file list: firstFile..lastFile say where. sourceListLines = lines of _sources/*.txt that point into the area.',
      maxLines: AREA_MAX,
      areas,
      filesInNoArea: unplaced,
    },
    null,
    1,
  ) + '\n',
);

// ================================================================ spot check: 10 random lines per list, opened at file:line
let seed = 20261118;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const spot = {};
for (const s of SURFACES) {
  const pool = items[s].slice();
  const picks = [];
  while (picks.length < 10 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  spot[s] = picks.map((it) => {
    let ok;
    let saw;
    if (it.line === 0) {
      ok = exists(it.file);
      saw = ok ? '(folder or file exists)' : '(missing)';
    } else {
      const l = lines(it.file)[it.line - 1] ?? '';
      saw = l.trim().slice(0, 90);
      ok = it.probe === null ? l !== undefined && exists(it.file) : l.includes(it.probe) || (lines(it.file)[it.line] || '').includes(it.probe);
    }
    return { ok, text: `${ok ? 'OK  ' : 'FAIL'} ${it.kind} | ${it.name.slice(0, 60)} | ${it.file}:${it.line}  =>  ${saw}` };
  });
}

// ================================================================ T1b.md (counts, spot check, limits) + console
const md = [];
md.push('# T1b: source lists by script (step A1b)', '');
md.push('Made by `node docs/system-map/_tools/sources.mjs` (plain Node, no dependencies, a few seconds). Re-run it to refresh every file below.', '');
md.push('## Files written', '');
for (const s of SURFACES) md.push(`- docs/system-map/_sources/${s}.txt: ${items[s].length} lines`);
md.push(`- docs/system-map/_sources/readers-raw.txt: ${readers.length} calls (${new Set(readers.map((r) => r.type + r.name.split(' ')[0])).size} different tables/functions)`);
md.push('- docs/system-map/_sources/sizes.csv', `- docs/system-map/_sources/areas.json: ${areas.length} areas`, '');
md.push('## Counts per kind', '');
for (const s of SURFACES) {
  md.push(`### ${s}.txt (${items[s].length})`, '');
  for (const [k, v] of Object.entries(counts[s]).sort()) md.push(`- ${k}: ${v}`);
  md.push('');
}
md.push('### readers-raw.txt', '');
const rc = {};
for (const r of readers) rc[`${r.type} / ${r.how}`] = (rc[`${r.type} / ${r.how}`] || 0) + 1;
for (const [k, v] of Object.entries(rc).sort()) md.push(`- ${k}: ${v}`);
md.push(`- database functions defined: ${dbFns.size}; tables: ${dbTables.size}; D1 tables: ${d1Tables.size}`, '');
md.push('## Areas proposed for A2', '', '| area | surface | files | lines | source-list lines |', '|---|---|---|---|---|');
for (const a of areas) md.push(`| ${a.id} | ${a.surface} | ${a.files} | ${a.lines}${a.overLimit ? ' OVER' : ''} | ${a.sourceListLines} |`);
md.push('', `Files in no area: ${unplaced.length}${unplaced.length ? ' (' + unplaced.slice(0, 10).join(', ') + ')' : ''}`, '');
md.push('## Spot check (10 random lines per list, opened at file:line by the script)', '');
let fails = 0;
for (const s of SURFACES) {
  const bad = spot[s].filter((x) => !x.ok).length;
  fails += bad;
  md.push(`### ${s}.txt: ${spot[s].length - bad}/${spot[s].length} sit where the list says`, '', '```', ...spot[s].map((x) => x.text), '```', '');
}
const report = md.join('\n');
const tail = fs.existsSync(path.join(WORK, 'T1b.notes.md')) ? '\n' + fs.readFileSync(path.join(WORK, 'T1b.notes.md'), 'utf8') : '';
fs.writeFileSync(path.join(WORK, 'T1b.md'), report + tail);

for (const s of SURFACES) console.log(`${s}.txt ${items[s].length}:`, Object.entries(counts[s]).sort().map(([k, v]) => `${k}=${v}`).join(' '));
console.log('readers-raw', readers.length, JSON.stringify(rc));
console.log('db functions', dbFns.size, 'tables', dbTables.size, 'd1 tables', d1Tables.size);
console.log('areas', areas.length, areas.map((a) => `${a.id}=${a.lines}${a.overLimit ? '!' : ''}`).join(' '));
console.log('unplaced', unplaced.length, unplaced.slice(0, 5).join(' '));
console.log('spot-check failures', fails);
for (const s of SURFACES) for (const x of spot[s]) if (!x.ok) console.log(' ', s, x.text);
