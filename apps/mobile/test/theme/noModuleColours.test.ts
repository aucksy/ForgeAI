/**
 * Gym branding (Level 1): the app repaints itself by changing the theme tokens' values in place
 * and re-drawing every screen (src/theme/gymTheme.ts). A colour copied out of the tokens when a
 * file is first loaded — `const CAPTION = { color: color.inkMuted }` outside any component, a
 * `StyleSheet.create` at the top of a file, a chart constant — would keep ForgeAI's colour for
 * ever. This reads every non-frozen source file and fails on any token colour read at load time.
 *
 * It also fails on ForgeAI's own accent written out by hand (#FF7A3B, its rgba, the button ink
 * #1F0D05 …) in screens, which a gym's colour could never replace. The allow-list holds only
 * colours that are NOT the theme (a product drawing's own paint, ForgeAI's logo).
 *
 * Frozen files (components/ui, components/charts, engine) are listed, not failed: they may not be
 * edited (CLAUDE.md), and what they still capture is reported in PROGRESS.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../src');
const FROZEN = [/^components\/ui\//, /^components\/charts\//, /^engine\//];
const TOKEN_OBJECTS = new Set(['color', 'chart', 'gradients', 'shadow']);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(SRC, p).replace(/\\/g, '/');
const isFrozen = (r: string) => FROZEN.some((re) => re.test(r));

/** Every `color.x` / `chart.x` / `gradients.x` / `shadow.x` (and `tokens.color.x`) read outside a function. */
function moduleLevelTokenReads(path: string, text: string): string[] {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // Local names bound to the token objects by `import { color, chart as c } from '@/theme/tokens'`.
  const local = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const from = st.moduleSpecifier.text;
    if (!/(^@\/theme\/tokens$)|(\/theme\/tokens$)|(^\.\/tokens$)/.test(from)) continue;
    const b = st.importClause?.namedBindings;
    if (!b) continue;
    if (ts.isNamespaceImport(b)) namespaces.add(b.name.text);
    else for (const el of b.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (TOKEN_OBJECTS.has(imported)) local.set(el.name.text, imported);
    }
  }
  const hits: string[] = [];
  const insideFunction = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration(p)) return true;
      if (ts.isTypeNode(p)) return true; // `typeof color.accent` reads nothing
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const base = n.expression;
      let hit: string | null = null;
      if (ts.isIdentifier(base) && local.has(base.text)) hit = `${local.get(base.text)}`;
      else if (ts.isPropertyAccessExpression(base) && ts.isIdentifier(base.expression) && namespaces.has(base.expression.text) && TOKEN_OBJECTS.has(base.name.text)) {
        hit = base.name.text;
      }
      if (hit && !insideFunction(n)) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        hits.push(`${rel(path)}:${line + 1} ${n.getText().slice(0, 60)}`);
        return; // one report per outermost read
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** ForgeAI's own accent/plane colours typed out by hand (a gym's colour can never reach them). */
const HAND_TYPED = /#FF7A3B|#FFA043|#FF8B4A|#F0570F|#1F0D05|rgba\(\s*255\s*,\s*122\s*,\s*59|rgba\(\s*31\s*,\s*13\s*,\s*5\b/i;
/** Load-time reads that are deliberate. Each says why. */
const LOAD_TIME_OK: Record<string, string> = {
  'theme/brandTokens.ts': "the copy of ForgeAI's own values, taken before any gym's palette is written in",
};
/** Hand-typed colours that are deliberately NOT the theme. Each says why. */
const HAND_TYPED_OK: Record<string, string> = {
  'theme/tokens.ts': 'the defaults themselves',
  'tracker/share/brand.ts': "ForgeAI's own logo mark on share pictures stays ForgeAI's",
};

describe('no token colour is copied at load time (gym branding repaints the app)', () => {
  const all = files(SRC);

  it('non-frozen source reads every token colour when it draws', () => {
    const hits = all
      .filter((p) => !isFrozen(rel(p)) && !(rel(p) in LOAD_TIME_OK))
      .flatMap((p) => moduleLevelTokenReads(p, readFileSync(p, 'utf8')));
    expect(hits).toEqual([]);
  });

  it("no screen types ForgeAI's accent out by hand", () => {
    const hits = all
      .map((p) => rel(p))
      .filter((r) => !isFrozen(r) && !(r in HAND_TYPED_OK))
      .filter((r) => HAND_TYPED.test(readFileSync(join(SRC, r), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the checker itself sees a load-time read and ignores one inside a component', () => {
    const src = [
      "import { color as c, space } from '@/theme/tokens';",
      'const LABEL = { color: c.inkMuted, padding: space.md };',
      'export function Row() { return { color: c.accent }; }',
      'const later = () => c.ink;',
    ].join('\n');
    const hits = moduleLevelTokenReads(join(SRC, 'x.tsx'), src);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('x.tsx:2');
  });

  it('frozen files: what they still capture is known (they may not be edited)', () => {
    const hits = all.filter((p) => isFrozen(rel(p))).flatMap((p) => moduleLevelTokenReads(p, readFileSync(p, 'utf8')));
    // These copy a colour when they load. The gym's look is written into the tokens BEFORE any
    // of them loads (index.js → theme/bootTheme.ts), so from the launch after a join they carry
    // the gym's colours; only within the run in which the member joins or leaves do they keep
    // the previous look:
    //  - components/ui/Badge.tsx: the badge tints (record badge = accent tint + bright accent);
    //  - components/charts/Heatmap.tsx: the consistency heatmap's four ramp steps;
    //  - components/ui/Logo.tsx: ForgeAI's own wordmark (ink + ember).
    const files = [...new Set(hits.map((h) => h.split(':')[0]))].sort();
    expect(files).toEqual(['components/charts/Heatmap.tsx', 'components/ui/Badge.tsx', 'components/ui/Logo.tsx']);
  });
});
