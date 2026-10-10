/**
 * v0.29.0 — Import routines from a Hevy share link (owner, 9 Oct 2026: "lets build that as
 * Import Routines functionality"). The export file has no routines (`routineRebuild` rebuilds
 * them from workouts); a shared folder or routine link shows them exactly as saved.
 *
 * Hevy's share page (hevy.com/folder/123, hevy.com/routine/AbC12) fills itself in with
 * JavaScript, so ForgeAI opens it in a hidden in-app browser and reads what is on the screen,
 * the way a person reads it — no Hevy account or key is used (`HevyLinkReader`). The page shows:
 *   h2 folder (or routine) name · h3 each routine · h5 each exercise, whose box reads
 *   "Chin Up / 3 sets · 9-12 reps / Rest 3m 0s" (a timed exercise: "3 sets" only).
 * Everything here is PURE: what the page script sends back → the routines to check.
 *
 * Audit Phase 4 (IM-02, IM-12): the headings do not say which sets are warm-ups ("5 sets" for
 * 2 warm-ups + 3 working). The page fills itself from Hevy's own data for the link (one
 * request the page makes, `shareable_folder/…` or `routine_with_short_id/…`), which holds every
 * set with its type and reps, each exercise's rest, superset and note, and whether it is timed.
 * The reader keeps a copy of that answer as the page receives it (`CAPTURE_API_JS`, run before
 * the page's own scripts) and reads the routines from it (`parseHevyApi`); the headings are the
 * fallback when it is missing.
 */
import type { DayType } from '@/types/models';

import type { LogType } from '../engine/logTypes';
import { workingCount, type PlanSet, type PlanSetType } from '../plans/routineSets';
import type { FoundRoutine } from './routineRebuild';

export type LinkKind = 'folder' | 'routine';

export interface RoutineLink {
  app: 'hevy';
  kind: LinkKind;
  /** The share link, made plain: https://hevy.com/folder/177335 */
  url: string;
}

/**
 * A Hevy share link found in what the member pasted ("Check out my folder https://hevy.com/
 * folder/177335" works too), or null.
 */
export function parseRoutineLink(text: string): RoutineLink | null {
  const m = /(?:https?:\/\/)?(?:www\.)?hevy(?:app)?\.com\/(folder|routine)\/([A-Za-z0-9_-]+)/i.exec(text);
  if (!m) return null;
  const kind = m[1].toLowerCase() as LinkKind;
  return { app: 'hevy', kind, url: `https://hevy.com/${kind}/${m[2]}` };
}

/** One heading as the page script read it; an exercise (h5) carries its box's text. */
export interface PageNode {
  tag: string;
  text: string;
  detail?: string;
}

/** What the page script sends back. */
export interface PageRead {
  nodes: PageNode[];
  /** Routines the page says the folder holds (0 = not said). */
  expected: number;
  notFound: boolean;
  timedOut: boolean;
  /** Phase 4: the page's own data for the link (Hevy's saved routines), when it was caught. */
  api?: unknown;
}

export interface LinkedExercise {
  title: string;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  /** Rest after each set, in seconds (null = none shown). */
  restSec: number | null;
  /** Phase 4 (IM-02): every set's type and target, when the page's own data said them. */
  setList?: PlanSet[] | null;
  /** Phase 4 (IM-12): Hevy says it is timed (a hold, cardio) — no rep target. */
  timed?: boolean;
  /** How Hevy logs it, as ForgeAI's type (for an exercise new to ForgeAI). */
  logType?: LogType | null;
  /** Hevy's superset id (rows with the same id go together). */
  supersetId?: string | null;
  note?: string | null;
}

export interface LinkedRoutine {
  title: string;
  exercises: LinkedExercise[];
}

export interface LinkedFolder {
  name: string;
  routines: LinkedRoutine[];
  /**
   * Phase 4: read from the page's own data (every set's type known) rather than its headings
   * (set counts only, warm-ups included).
   */
  fromPageData?: boolean;
}

/** "4 sets · 8-15 reps", "2 sets · 50 reps", "3 sets", "Rest 2m 15s" → numbers. PURE. */
export function parseExerciseBox(box: string): Omit<LinkedExercise, 'title'> | null {
  // The numbers line itself ("3 sets · 9-12 reps"), not a note that mentions sets.
  const detail = box.split(/\n/).find((l) => /^\s*\d+\s*sets?\b/i.test(l)) ?? box;
  const sets = /(\d+)\s*sets?\b/i.exec(detail);
  if (!sets) return null;
  const range = /(\d+)\s*[-–]\s*(\d+)\s*reps?\b/i.exec(detail);
  const one = range ? null : /(\d+)\s*reps?\b/i.exec(detail);
  const rest = /\bRest\s+(?:(\d+)\s*h\s*)?(?:(\d+)\s*m(?:in)?\s*)?(?:(\d+)\s*s)?/i.exec(box);
  const restSec = rest && (rest[1] || rest[2] || rest[3]) ? Number(rest[1] ?? 0) * 3600 + Number(rest[2] ?? 0) * 60 + Number(rest[3] ?? 0) : null;
  const lo = range ? Math.min(Number(range[1]), Number(range[2])) : one ? Number(one[1]) : null;
  const hi = range ? Math.max(Number(range[1]), Number(range[2])) : one ? Number(one[1]) : null;
  return { sets: Math.max(1, Number(sets[1])), repMin: lo, repMax: hi, restSec: restSec && restSec > 0 ? restSec : null };
}

/**
 * The page's headings → the folder and its routines, in the page's order. An h5 is an exercise
 * only when its box says how many sets (the creator's name is an h5 too). No h3 (a single
 * routine's page, or a routine link): one routine, named by the page's title. PURE.
 */
export function parseHevyPage(nodes: readonly PageNode[], kind: LinkKind = 'folder'): LinkedFolder {
  const title = nodes.find((n) => n.tag === 'h1' || n.tag === 'h2')?.text.trim() ?? '';
  // A routine's own page is one routine, whatever smaller headings it has.
  const hasRoutineHeads = kind === 'folder' && nodes.some((n) => n.tag === 'h3');
  const routines: LinkedRoutine[] = [];
  let cur: LinkedRoutine | null = hasRoutineHeads ? null : { title: title || 'Hevy routine', exercises: [] };
  if (cur) routines.push(cur);
  for (const n of nodes) {
    if (hasRoutineHeads && n.tag === 'h3') {
      cur = { title: n.text.trim() || `Routine ${routines.length + 1}`, exercises: [] };
      routines.push(cur);
      continue;
    }
    if (n.tag !== 'h5' || !cur) continue;
    const name = n.text.trim();
    // The box starts with the exercise's own name; the numbers come after it.
    const box = (n.detail ?? '').startsWith(name) ? (n.detail ?? '').slice(name.length) : (n.detail ?? '');
    const nums = name ? parseExerciseBox(box) : null;
    if (nums) cur.exercises.push({ title: name, ...nums });
  }
  return { name: title || 'From Hevy', routines: routines.filter((r) => r.exercises.length > 0) };
}

// ---------------------------------------------------------------- Phase 4: the page's own data

const SET_TYPE: Record<string, PlanSetType> = { warmup: 'warmup', normal: 'normal', failure: 'failure', dropset: 'drop', drop: 'drop' };

/** Hevy's exercise type → how ForgeAI logs it. PURE. */
export function hevyLogType(t: unknown): LogType | null {
  switch (t) {
    case 'weight_reps':
      return 'weight_reps';
    case 'reps_only':
      return 'reps';
    case 'bodyweight_reps':
      return 'weighted';
    case 'bodyweight_assisted_reps':
      return 'assisted';
    case 'duration':
    case 'weight_duration':
    case 'floors_duration':
    case 'steps_duration':
      return 'time';
    case 'distance_duration':
      return 'time_distance';
    case 'short_distance_weight':
      return 'distance';
    default:
      return null;
  }
}

const posInt = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.round(v)) : null;
const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 500) : null);

/** One exercise of Hevy's data → a linked exercise, or null when it has no name. PURE. */
function apiExercise(e: unknown): LinkedExercise | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const title = textOf(o.title);
  if (!title) return null;
  const logType = hevyLogType(o.exercise_type);
  const timed = logType === 'time' || logType === 'time_distance' || logType === 'distance';
  const sets: PlanSet[] = [];
  const working: number[] = [];
  for (const raw of Array.isArray(o.sets) ? o.sets.slice(0, 50) : []) {
    const st = (raw ?? {}) as Record<string, unknown>;
    const type = SET_TYPE[String(st.indicator ?? 'normal').toLowerCase()] ?? 'normal';
    const range = (st.rep_range && typeof st.rep_range === 'object' ? st.rep_range : null) as { start?: unknown; end?: unknown } | null;
    const lo = range ? posInt(range.start, 999) : null;
    const hi = range ? posInt(range.end, 999) : null;
    const reps = lo == null && hi == null ? posInt(st.reps, 999) : null;
    const weightKg = typeof st.weight_kg === 'number' && st.weight_kg > 0 ? Math.round(st.weight_kg * 100) / 100 : null;
    const durationSec = posInt(st.duration_seconds, 86_400);
    sets.push({
      type,
      ...(reps != null && !timed ? { reps } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(durationSec != null ? { durationSec } : {}),
    });
    if (type === 'normal' || type === 'failure') for (const n of [lo, hi, reps]) if (n != null) working.push(n);
  }
  if (sets.length === 0) sets.push({ type: 'normal' });
  const restSec = posInt(o.rest_seconds, 3600);
  const superset = o.superset_id == null || o.superset_id === '' ? null : String(o.superset_id);
  return {
    title,
    sets: Math.max(1, workingCount(sets)),
    repMin: timed || working.length === 0 ? null : Math.min(...working),
    repMax: timed || working.length === 0 ? null : Math.max(...working),
    restSec,
    setList: sets,
    timed,
    logType,
    supersetId: superset,
    note: textOf(o.notes),
  };
}

/**
 * The page's own data for a folder (`{ title, routines }`) or one routine (`{ routine }`) →
 * the folder and its routines in Hevy's order; null when it is not that. PURE.
 */
export function parseHevyApi(api: unknown, kind: LinkKind = 'folder'): LinkedFolder | null {
  if (!api || typeof api !== 'object') return null;
  const o = api as Record<string, unknown>;
  const one = (o.routine && typeof o.routine === 'object' ? o.routine : Array.isArray(o.exercises) ? o : null) as Record<string, unknown> | null;
  const list: unknown[] | null = Array.isArray(o.routines) ? o.routines : one ? [one] : null;
  if (!list) return null;
  const routines: LinkedRoutine[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const ro = r as Record<string, unknown>;
    const exercises = (Array.isArray(ro.exercises) ? ro.exercises : []).map(apiExercise).filter((e): e is LinkedExercise => e != null);
    if (exercises.length > 0) routines.push({ title: textOf(ro.title) ?? `Routine ${routines.length + 1}`, exercises });
  }
  const own = kind === 'routine' && routines.length === 1 ? routines[0].title : null;
  const name = textOf(o.title) ?? own ?? textOf(one?.title) ?? 'From Hevy';
  return { name, routines, fromPageData: true };
}

/**
 * The link's routines from what the reader sent: the page's own data when it was caught (set
 * types known), else the headings. PURE.
 */
export function readLinkedFolder(read: PageRead, kind: LinkKind): LinkedFolder {
  const fromData = parseHevyApi(read.api, kind);
  if (fromData && fromData.routines.length > 0) return fromData;
  return parseHevyPage(read.nodes, kind);
}

/**
 * IM-13: a read that got only part of the folder — fewer routines than the page says it holds
 * (`expected`), or exercises shown without their sets. Null when it looks whole. PURE.
 */
export function partialRead(read: PageRead | null, folder: LinkedFolder | null): { found: number; expected: number; missingSets: number } | null {
  if (!read || !folder || folder.routines.length === 0) return null;
  const found = folder.routines.length;
  const expected = Math.max(read.expected, found);
  // From the headings: an exercise heading whose box has no numbers yet (its sets not drawn).
  let missingSets = 0;
  if (!folder.fromPageData) {
    let inRoutine = false;
    for (const n of read.nodes) {
      if (n.tag === 'h3') inRoutine = true;
      if (n.tag !== 'h5' || !inRoutine) continue;
      const name = n.text.trim();
      const box = (n.detail ?? '').startsWith(name) ? (n.detail ?? '').slice(name.length) : (n.detail ?? '');
      if (name && !/^created by/i.test(n.detail ?? '') && box.trim() === '') missingSets += 1;
    }
  }
  if (expected > found || missingSets > 0) return { found, expected, missingSets };
  return null;
}

/** "Only 4 of 6 routines could be read — try again". PURE. */
export function partialReadText(p: { found: number; expected: number; missingSets: number }): string {
  if (p.expected > p.found) return `Only ${p.found} of ${p.expected} routines could be read — try again`;
  const n = p.missingSets;
  return `${n} exercise${n === 1 ? '' : 's'} came without ${n === 1 ? 'its' : 'their'} sets — try again`;
}

/** Why a read gave nothing, in the member's words; null when it has routines. PURE. */
export function readProblem(read: PageRead | null, folder: LinkedFolder | null): string | null {
  if (folder && folder.routines.length > 0) return null;
  if (!read) return 'We couldn’t open that link. Check your internet and try again.';
  if (read.notFound) return 'Hevy says this link does not exist any more. Copy it again from Hevy.';
  if (read.timedOut) return 'Hevy took too long to answer. Check your internet and try again.';
  return 'We found no routines on that page. Check that it is a Hevy folder or routine link.';
}

/** Push / pull / legs… from the routine's name (the same rule as the history import). */
export type DayTypeOf = (title: string) => DayType;

/**
 * The link's routines in the shape the check-and-follow steps use: every routine and every
 * exercise ticked (they are exactly as saved). Two routines with one name keep both, the
 * second named "Push 1 (2)". IM-12: one exercise twice in a routine (a back-off block at the
 * end) keeps both rows — each row has its own key. Each row carries its sets, rest, superset
 * and note as saved. PURE.
 */
export function linkedToFound(folder: LinkedFolder, dayTypeOf: DayTypeOf): FoundRoutine[] {
  const seen = new Map<string, number>();
  return folder.routines.map((r) => {
    const n = (seen.get(r.title) ?? 0) + 1;
    seen.set(r.title, n);
    const title = n === 1 ? r.title : `${r.title} (${n})`;
    const groups = new Map<string, number>();
    return {
      title,
      dayType: dayTypeOf(r.title),
      uses: 0,
      lastISO: '',
      recent: true,
      exercises: r.exercises.map((e, i) => {
        let supersetGroup: number | null = null;
        if (e.supersetId != null) {
          if (!groups.has(e.supersetId)) groups.set(e.supersetId, groups.size + 1);
          supersetGroup = groups.get(e.supersetId) ?? null;
        }
        return {
          title: e.title,
          key: `${i}:${e.title}`,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          lastISO: '',
          ticked: true,
          setList: e.setList ?? null,
          restSec: e.restSec,
          supersetGroup,
          note: e.note ?? null,
          timed: e.timed === true,
          logType: e.logType ?? null,
        };
      }),
    };
  });
}

/** Each exercise's rest from the link (the first one given wins), by exercise name. PURE. */
export function linkedRests(folder: LinkedFolder): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of folder.routines) for (const e of r.exercises) if (e.restSec != null && !out.has(e.title)) out.set(e.title, e.restSec);
  return out;
}

/**
 * Phase 4: runs in the hidden browser BEFORE the page's own scripts. It keeps a copy of the
 * page's request for the link's data (a folder or a routine) as the page receives it, so the
 * reader can send it back with the headings. Nothing else is read or changed; no other request
 * is touched. Plain old JavaScript (the phone's web view).
 *
 * Review fix: a folder page also fetches each routine on its own; the FOLDER's answer
 * (`shareable_folder`) is kept over any routine's, whichever comes last. And the page's own
 * `fetch` is called on `window` (calling it on anything else throws "Illegal invocation").
 */
export const CAPTURE_API_JS = `(function () {
  if (window.__forgeHook) return;
  window.__forgeHook = true;
  var RE = /api\\.hevyapp\\.com\\/(shareable_folder|routine_with_short_id|shareable_routine)\\//;
  function keep(url, body) {
    try {
      var m = RE.exec(String(url));
      if (!m) return;
      var folder = m[1] === 'shareable_folder';
      // A routine's answer never replaces the folder's.
      if (!folder && window.__forgeHevyFolder) return;
      window.__forgeHevyApi = typeof body === 'string' ? JSON.parse(body) : body;
      if (folder) window.__forgeHevyFolder = true;
    } catch (e) {}
  }
  try {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) { this.__forgeUrl = url; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var x = this;
      try {
        x.addEventListener('load', function () {
          try { keep(x.__forgeUrl, x.responseType === 'json' ? x.response : x.responseText); } catch (e) {}
        });
      } catch (e) {}
      return send.apply(this, arguments);
    };
  } catch (e) {}
  try {
    if (window.fetch) {
      var f = window.fetch;
      window.fetch = function (input) {
        var p = f.apply(window, arguments);
        try {
          var u = typeof input === 'string' ? input : input && input.url;
          if (RE.test(String(u))) p.then(function (res) { try { res.clone().text().then(function (t) { keep(u, t); }); } catch (e) {} });
        } catch (e) {}
        return p;
      };
    }
  } catch (e) {}
})();
true;`;

/**
 * Runs inside the hidden browser on Hevy's page. It waits until the routines are on the screen
 * (the page says how many a folder holds), reads the headings and posts them back. 20 s at most.
 * Plain old JavaScript: it runs in the phone's web view, not in the app.
 */
export const READ_PAGE_JS = `(function () {
  var tries = 0;
  function read() {
    var out = [];
    var els = document.querySelectorAll('h1,h2,h3,h4,h5');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var n = { tag: e.tagName.toLowerCase(), text: (e.textContent || '').trim() };
      if (n.tag === 'h5' && e.parentElement) n.detail = (e.parentElement.innerText || '').trim();
      out.push(n);
    }
    return out;
  }
  function expected() {
    try {
      var d = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      var m = d.props.pageProps.metadata;
      return (m && m.routine_count) || 0;
    } catch (e) { return 0; }
  }
  // Only what ForgeAI reads of the page's own data (its other languages and pictures stay out).
  function slim(a) {
    try {
      if (!a) return null;
      var rs = a.routines || (a.routine ? [a.routine] : null);
      if (!rs) return null;
      return {
        title: a.title || (a.routine && a.routine.title) || '',
        routines: rs.map(function (r) {
          return {
            title: r.title, notes: r.notes,
            exercises: (r.exercises || []).map(function (e) {
              return {
                title: e.title, exercise_type: e.exercise_type, rest_seconds: e.rest_seconds, superset_id: e.superset_id, notes: e.notes,
                sets: (e.sets || []).map(function (s) {
                  return { indicator: s.indicator, reps: s.reps, weight_kg: s.weight_kg, duration_seconds: s.duration_seconds, rep_range: s.rep_range };
                })
              };
            })
          };
        })
      };
    } catch (e) { return null; }
  }
  function tick() {
    tries++;
    var api = slim(window.__forgeHevyApi);
    var nodes = read();
    var heads = 0, boxes = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].tag === 'h3') heads++;
      if (nodes[i].tag === 'h5' && /\\d+\\s*sets?/i.test(nodes[i].detail || '')) boxes++;
    }
    var body = document.body ? document.body.innerText : '';
    var notFound = boxes === 0 && /not found|doesn.t exist|might not exist/i.test(body);
    var exp = expected();
    var whole = !!(api && api.routines && api.routines.length > 0 && (exp === 0 || api.routines.length >= exp));
    var ready = notFound || whole || (boxes > 0 && (exp > 0 ? heads >= exp : tries > 4));
    if (ready || tries >= 40) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ nodes: nodes, expected: exp, notFound: notFound, timedOut: !ready, api: api }));
      return;
    }
    setTimeout(tick, 500);
  }
  tick();
})();
true;`;

/** The page script's message → a PageRead, or null when it is not one. PURE. */
export function parsePageMessage(data: string): PageRead | null {
  try {
    const v = JSON.parse(data) as Partial<PageRead>;
    if (!v || !Array.isArray(v.nodes)) return null;
    const nodes = v.nodes
      .filter((n): n is PageNode => !!n && typeof n.tag === 'string' && typeof n.text === 'string')
      .slice(0, 2000)
      .map((n) => ({ tag: n.tag, text: n.text.slice(0, 200), detail: typeof n.detail === 'string' ? n.detail.slice(0, 1000) : undefined }));
    const api = v.api && typeof v.api === 'object' ? v.api : undefined;
    return { nodes, expected: Number(v.expected) || 0, notFound: v.notFound === true, timedOut: v.timedOut === true, ...(api ? { api } : {}) };
  } catch {
    return null;
  }
}
