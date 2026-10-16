/**
 * Audit C9-7: every word an owner reads in the admin app has its Hinglish pair. A guard, so the
 * next English-only line fails here instead of shipping silently.
 *
 * It reads every file under src/crm with the TypeScript parser and lists text an owner sees
 * that is NOT inside a `tr(en, hi)` call:
 *  - JSX text (`<p>Save</p>`);
 *  - a word literal given to a shown prop: placeholder, title, aria-label, label, alt, hint,
 *    sub, action, message, confirmLabel, emptyText;
 *  - the text of `throw new Error('…')` (forms show `e.message`).
 * Not counted: text inside `tr(…)`, anything without letters, a single code-like token, the
 * names in `SAME_IN_BOTH` (brand and glossary words that read the same in Hinglish), the files in
 * `SKIP_FILES` and the text in `ALLOWED_TEXT` (each with its reason).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const CRM = join(ROOT, 'src', 'crm');

/** Words that read the same in both languages (RESEARCH.md §5 glossary, brand names, symbols). */
const SAME_IN_BOTH = new Set(['ForgeAI', 'UPI', 'PT', 'GST', 'GSTIN', 'WhatsApp', 'Chrome', 'Edge', 'Excel', 'CSV', 'QR', 'OK']);

const SHOWN_PROPS = new Set([
  'placeholder',
  'title',
  'aria-label',
  'label',
  'alt',
  'hint',
  'sub',
  'action',
  'message',
  'confirmLabel',
  'emptyText',
]);

/** Files whose words are English on purpose, each with its reason. */
const SKIP_FILES: readonly { path: string; why: string }[] = [
  // Made-up members, plans and products for the demo gym: data, as if the owner typed it.
  { path: 'src/crm/data/demo.ts', why: 'demo gym data' },
  // "The printed receipt is English in every language (it is a money document)."
  { path: 'src/crm/ui/screens/Receipt.tsx', why: 'printed receipt, English by design' },
  // The printed member card reads in English with the gym's name (logic/memberCard.ts).
  { path: 'src/crm/ui/MemberCardSheet.tsx', why: 'printed member card, English by design' },
  // A picture of the member app, whose words are English.
  { path: 'src/crm/brand/PhonePreview.tsx', why: 'the member app’s own words' },
];

/** Text that is fine outside `tr`, each with its reason. */
const ALLOWED_TEXT: readonly { re: RegExp; why: string }[] = [
  // Programmer errors: a code for the next layer, or a broken invariant. Never on a screen.
  { re: /^[A-Z_]+$/, why: 'an error code read by the next layer' },
  { re: /must be used inside </, why: 'a React wiring mistake' },
  { re: /^bad (logo|photo) (name|ticket)$/, why: 'an invariant the server also checks' },
  { re: /^Not a YYYY-MM-DD date/, why: 'an invariant on stored dates' },
  // Example names in a form's placeholder: a name reads the same in Hinglish.
  { re: /^(Ramesh Sharma|Suresh|Riya Sharma|Rohit Meena|Rohit|Iron Temple Fitness|Quarterly)$/, why: 'example names' },
  // The brand mark, and the language switch that names both languages.
  { re: /^(FORGE|AI|POWERED BY FORGEAI|Language \/ Bhasha)$/, why: 'brand mark / both languages' },
  // The member inbox preview: the member app is English ("Iron Temple · now").
  { re: /^· now$/, why: 'member app preview' },
];

interface Hit {
  file: string;
  line: number;
  text: string;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function looksLikeWords(t: string): boolean {
  const s = t.trim();
  if (!/[A-Za-z]{2,}/.test(s)) return false;
  if (SAME_IN_BOTH.has(s)) return false;
  // One code-like token: a key, a class name, a path, a URL, an id.
  if (!/\s/.test(s) && (/^[a-z0-9_.:/#-]+$/.test(s) || /^[a-z][A-Za-z0-9]*$/.test(s) || /[/.:]/.test(s))) return false;
  return true;
}

function insideTr(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === 'tr' || p.expression.text === 'inEnglish')) return true;
  }
  return false;
}

function shownProp(n: ts.Node): string | null {
  let p = n.parent;
  if (p && ts.isJsxExpression(p)) p = p.parent;
  if (p && ts.isJsxAttribute(p)) {
    const name = p.name.getText();
    return SHOWN_PROPS.has(name) ? name : null;
  }
  return null;
}

function thrownText(n: ts.Node): boolean {
  const p = n.parent;
  return !!p && ts.isNewExpression(p) && p.expression.getText().endsWith('Error') && p.arguments?.[0] === n && !!p.parent && ts.isThrowStatement(p.parent);
}

function untranslated(path: string): Hit[] {
  const src = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const file = relative(ROOT, path).replace(/\\/g, '/');
  const out: Hit[] = [];
  const hit = (n: ts.Node, text: string) => {
    if (!looksLikeWords(text) || insideTr(n) || ALLOWED_TEXT.some((x) => x.re.test(text.trim()))) return;
    out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: text.trim() });
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) hit(n, n.getText(sf).replace(/\s+/g, ' '));
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (shownProp(n) || thrownText(n)) hit(n, n.text);
    } else if (ts.isTemplateExpression(n) && (shownProp(n) || thrownText(n))) {
      hit(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('…'));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('C9-7: the admin app’s words all have a Hinglish pair', () => {
  const all = files(CRM).filter((f) => !SKIP_FILES.some((s) => relative(ROOT, f).replace(/\\/g, '/').startsWith(s.path)));
  const hits = all.flatMap(untranslated);

  it('reads the whole admin app', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('no English-only word on a screen, in a prop an owner reads, or in an error a form shows', () => {
    expect(hits.map((h) => `${h.file}:${h.line} ${h.text.slice(0, 100)}`)).toEqual([]);
  });

  it('catches an English-only line, and lets a tr() pair through (a probe file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'admin-words-'));
    const f = join(dir, 'Probe.tsx');
    writeFileSync(
      f,
      [
        'export function P() {',
        "  if (x) throw new Error('That member is gone.');",
        '  return (',
        '    <Sheet title="Add member">',
        "      <input placeholder={tr('Name', 'Naam')} aria-label=\"Phone number\" />",
        "      <p>{tr('Saved.', 'Save ho gaya.')}</p>",
        '      <p>Fees collected</p>',
        '    </Sheet>',
        '  );',
        '}',
      ].join(String.fromCharCode(10)),
    );
    const seen = untranslated(f).map((h) => h.text);
    rmSync(dir, { recursive: true, force: true });
    expect(seen).toEqual(['That member is gone.', 'Add member', 'Phone number', 'Fees collected']);
  });

  it('keeps the skip list small and explained', () => {
    expect(SKIP_FILES.length).toBeLessThanOrEqual(5);
    expect(ALLOWED_TEXT.length).toBeLessThanOrEqual(8);
    for (const s of [...SKIP_FILES, ...ALLOWED_TEXT]) expect(s.why.length).toBeGreaterThan(5);
  });
});
