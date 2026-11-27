/**
 * R-631 slice A (design note docs/designs/R-631.md, sections 7, 9a, 9b tables, 9h): the one list of where personal
 * data goes, docs/legal/data-flows.json, checked against the code from both sides.
 *
 *  - 9a code -> list: every outside address, outside library, table (or storage bucket) with personal columns,
 *    worker storage binding and Android backup rule found in the code is a row of the list, or a named non-flow
 *    with its reason, or a dated allow-list row (docs/legal/data-flows-allow.json; never S1; may only shrink).
 *  - list -> code: everything a row points at is still in the code (a removed flow cannot leave a stale row).
 *  - schema: every row has exactly the section 7 columns, filled; the notice sections it names exist in EN and HI.
 *  - 9h: every row has an under-18 rule, and the "delete" rows are exactly the tables R-630's delete calls remove.
 *
 * Reads files only (no network, no build): seconds.
 */
import { describe, expect, it } from 'vitest';

import {
  personalColumns,
  readRepoFile,
  repoFileExists,
  scanBackup,
  scanBindings,
  scanHosts,
  scanPackages,
  scanTables,
  type Found,
} from './dataFlowsScan';

/** The allow-list may hold at most this many rows. Lower it when a row goes; never raise it (design 8). */
const ALLOW_MAX = 0;

/** Section 7's columns, in order. */
const COLUMNS = [
  'what',
  'from',
  'to',
  'platform',
  'who_sees',
  'why',
  'keep_for',
  'how_deleted',
  'switch',
  'live_or_test',
  'under18',
  'notice_section_en',
  'notice_section_hi',
  'source_link',
] as const;

const UNDER18 = ['delete', 'keep', 'not_collected'];
const LIVE_OR_TEST = ['live', 'test', 'on when the key is set', 'off', 'not deployed'];
const PLATFORMS = ['Android', 'iPhone', 'Wear OS', 'web', 'server'];

type Marker = { file: string; has: string };
type Code = {
  hosts?: string[];
  in?: string[];
  packages?: string[];
  tables?: string[];
  bindings?: string[];
  backup?: string[];
  markers?: Marker[];
  none?: string;
};
type Row = { id: string; code?: Code } & Record<(typeof COLUMNS)[number], string>;
type NotFlowHost = { host: string; in: string[]; kind: string; why: string };
type Flows = {
  columns: string[];
  own_hosts: Array<{ host: string; why: string }>;
  not_flows: {
    hosts: NotFlowHost[];
    packages: Array<{ package: string; why: string }>;
    stores: Array<{ key: string; why: string }>;
    bindings: Array<{ key: string; why: string }>;
  };
  rows: Row[];
};
type AllowRow = { item: string; finding: string; ends: string };

const flows = JSON.parse(readRepoFile('docs/legal/data-flows.json')) as Flows;
const allow = (JSON.parse(readRepoFile('docs/legal/data-flows-allow.json')) as { rows: AllowRow[] }).rows;
const allowed = new Set(allow.map((a) => a.item));

const hosts = scanHosts();
const packages = scanPackages();
const tables = scanTables();
const bindings = scanBindings();
const backup = scanBackup();

/** `file` is one of `prefixes`, or inside one of them (a folder). */
const under = (file: string, prefixes: readonly string[] = []) =>
  prefixes.some((p) => file === p || file.startsWith(p.endsWith('/') ? p : `${p}/`));

const isOwn = (host: string) => flows.own_hosts.some((o) => host === o.host || host.endsWith(`.${o.host}`));

/** A list entry names a library: exact for JS; for Kotlin "kt:a.b." is a prefix and "kt:a.b" means a.b or a.b.* */
const pkgMatch = (found: string, entry: string) => {
  if (!entry.startsWith('kt:')) return found === entry;
  return entry.endsWith('.') ? found.startsWith(entry) : found === entry || found.startsWith(`${entry}.`);
};

const rowsWith = (pick: (c: Code) => string[] | undefined) => flows.rows.filter((r) => (pick(r.code ?? {}) ?? []).length > 0);

/** Items the code has that nothing on the list (or the allow-list) covers. */
function uncovered(found: Found[], kind: string, covered: (f: Found) => boolean, key = (f: Found) => `${kind}:${f.key}@${f.file}`) {
  return found.filter((f) => !covered(f) && !allowed.has(key(f))).map(key);
}

describe('R-631 9a: everything the code sends out or keeps is on the data-flow list', () => {
  it('the readers see the code (a reader that finds nothing would pass everything)', () => {
    expect(hosts.length).toBeGreaterThan(40);
    expect(packages.length).toBeGreaterThan(60);
    expect(tables.length).toBeGreaterThan(120);
    expect(bindings.length).toBeGreaterThanOrEqual(9);
    expect(backup.length).toBeGreaterThanOrEqual(20);
    // Known items each reader must find, so a broken pattern fails loudly.
    expect(hosts.some((h) => h.key === 'api.sarvam.ai' && h.file === 'deploy/panel/assist.js')).toBe(true);
    expect(hosts.some((h) => h.key === 'fonts.googleapis.com' && h.file === 'apps/dashboard/index.html')).toBe(true);
    expect(packages.some((p) => p.key === '@anthropic-ai/sdk')).toBe(true);
    expect(packages.some((p) => p.key.startsWith('kt:com.google.android.gms.wearable'))).toBe(true);
    expect(tables.find((t) => t.key === 'supabase:public.gym_members')?.columns).toContain('phone');
    expect(tables.find((t) => t.key === 'panel:feedback')?.columns).toContain('ip_hash');
    expect(bindings.map((b) => b.key)).toContain('hq:kv_namespaces:BACKUP');
    expect(backup.map((b) => b.key)).toContain('cloud-backup:include:file:photo-backup/');
  });

  it('comments are not calls: an address in a "Source: https://..." note is not read as a flow', () => {
    expect(hosts.some((h) => h.key === 'help.hevyapp.com')).toBe(false);
    expect(hosts.some((h) => h.key === 'developers.cloudflare.com')).toBe(false);
  });

  it('every outside web address in the code is a row, a named non-flow, or allowed', () => {
    const rows = rowsWith((c) => c.hosts);
    const missing = uncovered(
      hosts.filter((h) => !isOwn(h.key)),
      'host',
      (h) =>
        rows.some((r) => r.code!.hosts!.includes(h.key) && under(h.file, r.code!.in)) ||
        flows.not_flows.hosts.some((n) => n.host === h.key && under(h.file, n.in)),
    );
    expect(missing, 'add a row to docs/legal/data-flows.json (or a not_flows.hosts entry with its reason)').toEqual([]);
  });

  it('every outside library the code imports is a row, a library that sends nothing, or allowed', () => {
    const rows = rowsWith((c) => c.packages);
    const missing = uncovered(
      packages,
      'package',
      (p) =>
        rows.some((r) => r.code!.packages!.some((e) => pkgMatch(p.key, e))) ||
        flows.not_flows.packages.some((n) => pkgMatch(p.key, n.package)),
    );
    expect([...new Set(missing.map((m) => m.split('@').slice(0, -1).join('@')))], 'a new library: say what it sends').toEqual([]);
  });

  it('every table or storage bucket with personal columns (both databases) is a row, a named non-personal store, or allowed', () => {
    const listed = new Set(flows.rows.flatMap((r) => r.code?.tables ?? []));
    const plain = new Set(flows.not_flows.stores.map((s) => s.key));
    const personal = tables.filter((t) => t.key.includes(':bucket:') || personalColumns(t.columns).length > 0);
    const missing = personal
      .filter((t) => !listed.has(t.key) && !plain.has(t.key) && !allowed.has(`table:${t.key}`))
      .map((t) => `table:${t.key} (${personalColumns(t.columns).join(', ')}) ${t.file}`);
    expect(missing).toEqual([]);
  });

  it('every worker storage binding and logs switch (wrangler.jsonc) is a row, a named non-store, or allowed', () => {
    const listed = new Set([...flows.rows.flatMap((r) => r.code?.bindings ?? []), ...flows.not_flows.bindings.map((b) => b.key)]);
    expect(bindings.filter((b) => !listed.has(b.key) && !allowed.has(`binding:${b.key}`)).map((b) => `${b.key} ${b.file}`)).toEqual([]);
  });

  it('every Android backup rule, and each app’s allowBackup, is a row (or allowed)', () => {
    const listed = new Set(flows.rows.flatMap((r) => r.code?.backup ?? []));
    expect(backup.filter((b) => !listed.has(b.key) && !allowed.has(`backup:${b.key}`)).map((b) => `${b.key} ${b.file}`)).toEqual([]);
  });
});

describe('R-631: the list points only at code that still exists (checked from both sides)', () => {
  it('every address, library, table, binding and backup rule a row names is still in the code', () => {
    const stale: string[] = [];
    for (const r of flows.rows) {
      const c = r.code ?? {};
      for (const h of c.hosts ?? []) if (!hosts.some((f) => f.key === h && under(f.file, c.in))) stale.push(`${r.id}: host ${h}`);
      for (const p of c.packages ?? []) if (!packages.some((f) => pkgMatch(f.key, p))) stale.push(`${r.id}: package ${p}`);
      for (const t of c.tables ?? []) if (!tables.some((f) => f.key === t)) stale.push(`${r.id}: table ${t}`);
      for (const b of c.bindings ?? []) if (!bindings.some((f) => f.key === b)) stale.push(`${r.id}: binding ${b}`);
      for (const b of c.backup ?? []) if (!backup.some((f) => f.key === b)) stale.push(`${r.id}: backup ${b}`);
    }
    expect(stale).toEqual([]);
  });

  it('every hand row (no address in the code) names the code that starts it, or says why there is none', () => {
    const problems: string[] = [];
    for (const r of flows.rows) {
      const c = r.code ?? {};
      const points = [c.hosts, c.packages, c.tables, c.bindings, c.backup, c.markers].some((x) => (x ?? []).length > 0);
      if (!points && !(c.none && c.none.trim().length > 20)) problems.push(`${r.id}: no code and no reason`);
      for (const m of c.markers ?? []) {
        if (!repoFileExists(m.file)) problems.push(`${r.id}: ${m.file} is gone`);
        else if (!readRepoFile(m.file).includes(m.has)) problems.push(`${r.id}: ${m.file} no longer has "${m.has}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the named non-flows are still in the code, each with a reason', () => {
    const stale: string[] = [];
    for (const n of flows.not_flows.hosts) {
      if (!n.why || !n.kind) stale.push(`${n.host}: no reason`);
      if (!hosts.some((h) => h.key === n.host && under(h.file, n.in))) stale.push(`host ${n.host} in ${n.in.join(', ')}`);
    }
    for (const n of flows.not_flows.packages) if (!packages.some((p) => pkgMatch(p.key, n.package))) stale.push(`package ${n.package}`);
    for (const n of flows.not_flows.stores) if (!tables.some((t) => t.key === n.key)) stale.push(`store ${n.key}`);
    for (const n of flows.not_flows.bindings) if (!bindings.some((b) => b.key === n.key)) stale.push(`binding ${n.key}`);
    expect(stale).toEqual([]);
  });
});

describe('R-631: the allow-list of known gaps only shrinks', () => {
  const findings = new Map(
    readRepoFile('docs/system-map/findings.jsonl')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { id: string; severity?: string })
      .map((f) => [f.id, f.severity ?? ''] as const),
  );

  it(`holds at most ${ALLOW_MAX} rows, ids only, each dated and tied to a finding that is not S1`, () => {
    expect(allow.length, 'the allow-list grew: list the flow instead (or lower ALLOW_MAX when a row goes)').toBeLessThanOrEqual(ALLOW_MAX);
    const today = new Date().toISOString().slice(0, 10);
    for (const a of allow) {
      expect(Object.keys(a).sort()).toEqual(['ends', 'finding', 'item']);
      expect(a.item).toMatch(/^(host|package|table|binding|backup):\S+$/);
      expect(a.ends, a.item).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.ends >= today, `${a.item}: its end date ${a.ends} has passed`).toBe(true);
      expect(findings.has(a.finding), `${a.item}: unknown finding ${a.finding}`).toBe(true);
      expect(findings.get(a.finding), `${a.item}: an S1 gap can never be allowed`).not.toBe('S1');
    }
  });
});

describe('R-631 section 7: every row has the copies-list columns', () => {
  it('the file names exactly the section 7 columns, and every row has them all, filled, and a unique id', () => {
    expect(flows.columns).toEqual([...COLUMNS]);
    const ids = flows.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of flows.rows) {
      expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(Object.keys(r).filter((k) => k !== 'id' && k !== 'code').sort(), r.id).toEqual([...COLUMNS].sort());
      for (const c of COLUMNS) {
        expect(typeof r[c], `${r.id}.${c}`).toBe('string');
        expect(r[c].trim().length, `${r.id}.${c} is empty`).toBeGreaterThan(1);
      }
    }
  });

  it('platform, live_or_test and unknown values use the fixed words', () => {
    for (const r of flows.rows) {
      for (const p of r.platform.split(',').map((s) => s.trim())) expect(PLATFORMS, `${r.id}.platform`).toContain(p);
      expect(LIVE_OR_TEST, `${r.id}.live_or_test`).toContain(r.live_or_test);
      for (const c of COLUMNS) {
        if (/^unknown\b/i.test(r[c])) expect(r[c], `${r.id}.${c}: "unknown" needs a reason`).toMatch(/^unknown[^:]*: .{10,}/);
      }
    }
  });

  it('a secret-gated flow says it is on only when its key is set', () => {
    for (const id of ['assist-voice-sarvam', 'voice-groq', 'help-answers-claude', 'ai-assistant-claude', 'member-import-ai', 'hq-english-helper']) {
      expect(flows.rows.find((r) => r.id === id)?.live_or_test, id).toBe('on when the key is set');
    }
  });

  it('the hand rows the design names are on the list', () => {
    const ids = new Set(flows.rows.map((r) => r.id));
    for (const id of [
      'android-backup-cloud',
      'android-backup-photos',
      'ai-coach', // the speech recognizer
      'member-push-token',
      'health-connect',
      'watch-link',
      'google-play-delivery',
      'supabase-backups',
      'd1-time-travel',
      'workers-logs',
      'meta-whatsapp-copy',
      'cloudflare-web-analytics',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('9b: each notice section a row names exists in the English and Hindi notices ("none" = not in the notice yet)', () => {
    const en = readRepoFile('docs/legal/privacy.body.html');
    const hi = readRepoFile('docs/legal/privacy-hi.body.html');
    const has = (html: string, ref: string) => {
      const [id, letter] = ref.split('/');
      const at = html.indexOf(`id="${id}"`);
      if (at < 0) return false;
      if (!letter) return true;
      const next = html.indexOf('<h2', at + 1);
      return html.slice(at, next < 0 ? undefined : next).includes(`<h3>${letter}.`);
    };
    const bad: string[] = [];
    for (const r of flows.rows) {
      for (const [html, value, lang] of [
        [en, r.notice_section_en, 'en'],
        [hi, r.notice_section_hi, 'hi'],
      ] as const) {
        if (value === 'none') continue;
        for (const ref of value.split(',').map((s) => s.trim())) {
          if (lang === 'hi' && !ref.startsWith('hi-')) bad.push(`${r.id}: ${ref} is not a Hindi section`);
          if (!has(html, ref)) bad.push(`${r.id}: no section ${ref} in the ${lang} notice`);
        }
      }
      expect(r.notice_section_en === 'none', `${r.id}: EN and HI must both name a section, or both say none`).toBe(r.notice_section_hi === 'none');
    }
    expect(bad).toEqual([]);
  });

  it('source links: an outside company’s own page (https), a repo file that exists, or "unknown" with a reason', () => {
    for (const r of flows.rows) {
      const s = r.source_link;
      if (/^https:\/\//.test(s) || /^unknown: .{10,}/.test(s)) continue;
      expect(repoFileExists(s), `${r.id}: ${s}`).toBe(true);
    }
  });

  it('holds no real personal data: the repo is public (no phone numbers, no e-mail addresses)', () => {
    const text = readRepoFile('docs/legal/data-flows.json');
    // Ten or more digits in a row (spaces allowed): a phone number. Dates and versions have dashes or dots.
    expect(text.match(/(?<![\w.-])\+?\d(?: ?\d){9,}(?![\w.-])/g) ?? []).toEqual([]);
    expect(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).toEqual([]);
  });
});

describe('R-631 9h: every flow has an under-18 rule, matching R-630’s delete', () => {
  it('every row says delete, keep or not_collected', () => {
    for (const r of flows.rows) expect(UNDER18, `${r.id}.under18`).toContain(r.under18);
  });

  it('the rows marked "delete" are exactly the tables R-630’s delete calls remove (supabase 0101)', () => {
    const sql = readRepoFile('supabase/migrations/0101_member_under18.sql').replace(/--[^\n]*/g, '');
    const deleted = new Set([...sql.matchAll(/delete\s+from\s+public\.([a-z_]+)/gi)].map((m) => `supabase:public.${m[1]!.toLowerCase()}`));
    expect(deleted.size).toBeGreaterThan(3);
    const wrong: string[] = [];
    const covered = new Set<string>();
    for (const r of flows.rows) {
      const own = (r.code?.tables ?? []).filter((t) => t.startsWith('supabase:public.'));
      for (const t of own) {
        if (deleted.has(t)) covered.add(t);
        if (deleted.has(t) && r.under18 !== 'delete') wrong.push(`${r.id}: ${t} is deleted for under 18, so the row says delete`);
        if (!deleted.has(t) && r.under18 === 'delete') wrong.push(`${r.id}: says delete, but 0101 does not delete ${t}`);
      }
    }
    for (const t of deleted) if (!covered.has(t)) wrong.push(`${t}: deleted by 0101 but on no row`);
    expect(wrong).toEqual([]);
  });
});
