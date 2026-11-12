// The help library grows with the app (owner's HARD RULE, R-319 item 10, 4 Nov 2026: "there should be a
// dedicated pre-configured pre-built help database which keeps updating itself as the app progresses
// that should be a hard rule").
//
// The AI help answers (deploy/panel/help.js) read ONLY deploy/panel/helpArticles.js. So every screen a
// member or a gym can open must be named there: either by an article's `screens` list (the article that
// explains it), or in NO_HELP_SCREENS with a one-line reason (a redirect, a layout file, a screen a
// help answer can never be about). This check walks the screen folders on disk and FAILS when:
//   - a screen file is in neither list (a new screen was added without a help decision), or
//   - a listed path no longer exists (a screen was moved or deleted; the article points nowhere), or
//   - a path is listed twice (two answers for one screen).
//
// Why a coverage list and not "did this commit touch helpArticles.js": a diff check depends on which
// commits a push carries (a rebase, several commits in one push, a merge) and is passed by touching
// the file with any change at all. The list is checked against the whole tree on every run, so it is
// deterministic, it cannot be fooled by an unrelated edit, and it also catches screens that were
// deleted or renamed.
//
// Screens checked: every .tsx under apps/mobile/src/app (the member app's screens, expo-router), every
// .tsx under apps/dashboard/src/crm/ui/screens and every *Screen.tsx under apps/dashboard/src/crm (the
// gym admin app). Test files are skipped. Run: node scripts/ci/help_coverage.mjs (CI: ci.yml).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const posix = (p) => p.split(sep).join('/');

function walk(dir, keep) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(name)) out.push(posix(relative(ROOT, full)));
  }
  return out;
}

const isScreen = (name) => name.endsWith('.tsx') && !/\.test\.tsx$/.test(name);

/** Every screen file on disk, repo-relative with forward slashes. */
export function screensOnDisk(root = ROOT) {
  const rel = (p) => join(root, p);
  const files = new Set([
    ...walk(rel('apps/mobile/src/app'), isScreen),
    ...walk(rel('apps/dashboard/src/crm/ui/screens'), isScreen),
    ...walk(rel('apps/dashboard/src/crm'), (n) => /Screen\.tsx$/.test(n)),
  ]);
  return [...files].sort();
}

/** What is wrong, as plain lines; [] when every screen has a help decision. PURE. */
export function coverageProblems(onDisk, articles, noHelp) {
  const problems = [];
  const listed = new Map();
  const add = (path, where) => {
    if (listed.has(path)) problems.push(`${path} is listed twice (${listed.get(path)} and ${where})`);
    else listed.set(path, where);
  };
  for (const a of articles) for (const p of a.screens || []) add(p, `article "${a.id}"`);
  for (const [p, why] of Object.entries(noHelp || {})) {
    if (typeof why !== 'string' || why.trim().length < 5) problems.push(`${p}: NO_HELP_SCREENS needs a one-line reason`);
    add(p, 'NO_HELP_SCREENS');
  }
  const disk = new Set(onDisk);
  for (const p of onDisk) {
    if (!listed.has(p)) {
      problems.push(`${p} is a screen with no help decision: add it to an article's "screens" in deploy/panel/helpArticles.js (write or update the article), or to NO_HELP_SCREENS with a reason`);
    }
  }
  for (const [p, where] of listed) {
    if (!disk.has(p)) problems.push(`${p} (${where}) is not a screen on disk any more: remove or rename it in deploy/panel/helpArticles.js`);
  }
  return problems;
}

async function main() {
  // Unreleased articles count too: their screens are built (helpArticles.js ALL_HELP_ARTICLES).
  const { ALL_HELP_ARTICLES: HELP_ARTICLES, NO_HELP_SCREENS } = await import(pathToFileURL(join(ROOT, 'deploy/panel/helpArticles.js')).href);
  const onDisk = screensOnDisk();
  const problems = coverageProblems(onDisk, HELP_ARTICLES, NO_HELP_SCREENS);
  if (problems.length) {
    console.error(`Help library check FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Owner rule (R-319): the help library must grow with the app. Every new screen gets a help article, or a reason why not.');
    process.exit(1);
  }
  const covered = HELP_ARTICLES.reduce((n, a) => n + (a.screens || []).length, 0);
  console.log(`Help library check passed: ${onDisk.length} screens, ${covered} explained by ${HELP_ARTICLES.length} articles, ${onDisk.length - covered} with a reason for no help.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
