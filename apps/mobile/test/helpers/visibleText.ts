/**
 * Audit Phase 7 (packet B): the words a member can read, pulled out of the app's own source with
 * the TypeScript parser — JSX text, and string / template literals that look like words rather
 * than code. Used by the one-word-per-idea guard (`test/lib/memberWords.test.ts`).
 *
 * "Looks like words": a literal is skipped when it is plainly code —
 *  - an import / export path, an object key, or `x === 'literal'` style comparison text that is
 *    a single lowercase token ("session", "volume", "pr"), which is how store keys, icon names,
 *    route names and enum values are written;
 *  - a path ("/session/active") or anything with no letters;
 *  - the value of a JSX prop that is never shown: name, icon, testID, key, href, pathname…
 * Everything else counts. That is deliberately wide: a false hit is fixed by the allow-list in
 * the guard, a miss is a member reading "session".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';

export interface VisibleText {
  /** Path from apps/mobile, forward slashes: "src/app/(tabs)/workout.tsx". */
  file: string;
  line: number;
  text: string;
}

const HIDDEN_PROPS = new Set([
  'name',
  'icon',
  'testID',
  'nativeID',
  'key',
  'href',
  'pathname',
  'accessibilityRole',
  'role',
  'keyboardType',
  'autoCapitalize',
  'autoComplete',
  'textContentType',
  'returnKeyType',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'pointerEvents',
  'resizeMode',
  'contentFit',
  'ellipsizeMode',
  'behavior',
  'animationType',
  'presentationStyle',
  'kind',
  'tone',
  'variant',
  'size',
  'color',
  'fill',
  'stroke',
]);

/** SQL is never shown ("… AS sessions", "workout_sessions"). */
const SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH|ALTER|DROP|PRAGMA)\b/i;

function isCodeToken(s: string): boolean {
  const t = s.trim();
  if (t === '') return true;
  if (SQL.test(t)) return true;
  if (!/[A-Za-z]/.test(t)) return true;
  // A path or URL.
  if (!/\s/.test(t) && /[/\\.:]/.test(t)) return true;
  // One lowercase token: a key, an enum value, an icon or route name.
  if (/^[a-z0-9_\-]+$/.test(t)) return true;
  // camelCase / snake identifiers.
  if (/^[a-z][A-Za-z0-9_]*$/.test(t)) return true;
  return false;
}

function propName(n: ts.Node): string | null {
  const p = n.parent;
  if (!p) return null;
  if (ts.isJsxAttribute(p)) return p.name.getText();
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return p.parent.name.getText();
  return null;
}

/**
 * A one-word literal that is a branch of `a ? 'session' : 'sessions'` inside JSX or a template:
 * that IS shown, even though it looks like a code token.
 */
function shownWordBranch(n: ts.Node): boolean {
  const p = n.parent;
  if (!p || !ts.isConditionalExpression(p) || p.condition === n) return false;
  for (let a: ts.Node | undefined = p.parent, i = 0; a && i < 4; a = a.parent, i++) {
    if (ts.isJsxExpression(a) && !(a.parent && ts.isJsxAttribute(a.parent))) return true;
    if (ts.isTemplateSpan(a)) return true;
  }
  return false;
}

/**
 * C9-4: a one-word literal handed to a helper that puts it on screen: `countWord(n, 'session')`
 * (the word and its plural), `tell('…')`, `say('…')`. It looks like a code token but is shown.
 */
const SHOWN_ARGS: Readonly<Record<string, readonly number[] | 'all'>> = {
  countWord: [1, 3],
  tell: 'all',
  say: 'all',
};

function shownByCall(n: ts.Node): boolean {
  const p = n.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  const callee = p.expression;
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
  const which = SHOWN_ARGS[name];
  if (!which) return false;
  const at = p.arguments.indexOf(n as ts.Expression);
  return at >= 0 && (which === 'all' || which.includes(at));
}

function skipLiteral(n: ts.Node): boolean {
  const p = n.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p) && p.expression.getText() === 'require') return true;
  if (ts.isImportTypeNode(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === n) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
  const prop = propName(n);
  if (prop && HIDDEN_PROPS.has(prop)) return true;
  return false;
}

/** All visible text in one source file. */
export function visibleTextOf(path: string, root: string): VisibleText[] {
  const src = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: VisibleText[] = [];
  const file = relative(root, path).replace(/\\/g, '/');
  const push = (node: ts.Node, text: string) => {
    if (isCodeToken(text)) return;
    out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) {
      const t = n.getText(sf).replace(/\s+/g, ' ').trim();
      if (t) push(n, t);
    } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (shownWordBranch(n) || shownByCall(n)) out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: n.text });
      else if (!skipLiteral(n)) push(n, n.text);
    } else if (ts.isTemplateExpression(n)) {
      // The fixed words of a template, with each ${…} as "…".
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      push(n, parts.join('…'));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * C9-3: the words in the Android code a member reads: notification titles, buttons and channel
 * names, the widget and the whole watch app (all hard-coded in Kotlin). Every string literal
 * counts EXCEPT the ones a member never sees: log lines (`Log.w(TAG, "…")`), comments,
 * `@Suppress(…)`, regexes, date patterns, exception text, JSON keys read or written
 * (`optString("title", …)`, `mapOf("kind" to …)`), plus anything `isCodeToken` calls code (keys,
 * actions, tags). Same rule as the TypeScript reader: wide on purpose.
 */
const KT_HIDDEN_LINE =
  /\bLog\.[diwev]\(|\bprintln\(|@Suppress\(|\bRegex\(|SimpleDateFormat\(|Exception\(|\b(LOG_)?TAG\s*=|\bName\(|sendEvent\(|\bopt(String|Int|Long|Double|Boolean)\(|\bput(String|Extra|Int|Long)\(|\bmapOf\(/;

export function kotlinTextOf(path: string, root: string): VisibleText[] {
  const file = relative(root, path).replace(/\\/g, '/');
  const out: VisibleText[] = [];
  let inBlock = false;
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      let line = raw;
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end < 0) return;
        line = line.slice(end + 2);
        inBlock = false;
      }
      // Comments: KDoc quotes notification text in "…", which is not itself shown.
      line = line.replace(/\/\*.*?\*\//g, '');
      const open = line.indexOf('/*');
      if (open >= 0) {
        line = line.slice(0, open);
        inBlock = true;
      }
      const lineComment = line.search(/(^|[^:"])\/\//);
      if (lineComment >= 0) line = line.slice(0, lineComment + 1);
      if (KT_HIDDEN_LINE.test(line)) return;
      for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const text = m[1].replace(/\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_.]*/g, '…');
        if (!isCodeToken(text)) out.push({ file, line: i + 1, text });
      }
    });
  return out;
}

/** C9-3: `<string>` values in an Android strings.xml (not the ones marked translatable="false"). */
export function stringsXmlTextOf(path: string, root: string): VisibleText[] {
  const file = relative(root, path).replace(/\\/g, '/');
  const out: VisibleText[] = [];
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const m of line.matchAll(/<string\b([^>]*)>([^<]*)<\/string>/g)) {
        if (/translatable="false"/.test(m[1])) continue;
        const text = m[2].replace(/\\'/g, "'");
        if (!isCodeToken(text)) out.push({ file, line: i + 1, text });
      }
    });
  return out;
}

/**
 * C9-3: the words in app.json a member reads: the app's name and the permission questions
 * Android asks. Every string value with a space in it, plus `name`.
 */
export function appJsonTextOf(path: string, root: string): VisibleText[] {
  const file = relative(root, path).replace(/\\/g, '/');
  const out: VisibleText[] = [];
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'string') {
      if (key === 'name' || /\s/.test(v.trim())) out.push({ file, line: 0, text: v });
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(JSON.parse(readFileSync(path, 'utf8')), '');
  return out;
}

/** Every .tsx (and, if asked, .ts) file under a folder. */
export function sourceFiles(dir: string, exts: readonly string[] = ['.tsx']): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

export const MOBILE_ROOT = resolve(__dirname, '../..');
