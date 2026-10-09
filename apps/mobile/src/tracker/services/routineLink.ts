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
 */
import type { DayType } from '@/types/models';

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
}

export interface LinkedExercise {
  title: string;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  /** Rest after each set, in seconds (null = none shown). */
  restSec: number | null;
}

export interface LinkedRoutine {
  title: string;
  exercises: LinkedExercise[];
}

export interface LinkedFolder {
  name: string;
  routines: LinkedRoutine[];
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
 * second named "Push 1 (2)". PURE.
 */
export function linkedToFound(folder: LinkedFolder, dayTypeOf: DayTypeOf): FoundRoutine[] {
  const seen = new Map<string, number>();
  return folder.routines.map((r) => {
    const n = (seen.get(r.title) ?? 0) + 1;
    seen.set(r.title, n);
    const title = n === 1 ? r.title : `${r.title} (${n})`;
    // One exercise twice in a routine (a second block) keeps the first; the steps key by name.
    const names = new Set<string>();
    const exercises = r.exercises.filter((e) => !names.has(e.title) && names.add(e.title));
    return {
      title,
      dayType: dayTypeOf(r.title),
      uses: 0,
      lastISO: '',
      recent: true,
      exercises: exercises.map((e) => ({ title: e.title, sets: e.sets, repMin: e.repMin, repMax: e.repMax, lastISO: '', ticked: true })),
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
  function tick() {
    tries++;
    var nodes = read();
    var heads = 0, boxes = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].tag === 'h3') heads++;
      if (nodes[i].tag === 'h5' && /\\d+\\s*sets?/i.test(nodes[i].detail || '')) boxes++;
    }
    var body = document.body ? document.body.innerText : '';
    var notFound = boxes === 0 && /not found|doesn.t exist|might not exist/i.test(body);
    var exp = expected();
    var ready = notFound || (boxes > 0 && (exp > 0 ? heads >= exp : tries > 4));
    if (ready || tries >= 40) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ nodes: nodes, expected: exp, notFound: notFound, timedOut: !ready }));
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
    return { nodes, expected: Number(v.expected) || 0, notFound: v.notFound === true, timedOut: v.timedOut === true };
  } catch {
    return null;
  }
}
