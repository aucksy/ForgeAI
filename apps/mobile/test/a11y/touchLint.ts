/**
 * UAT WP13 (17 Oct 2026): the phone's label / touch-target lint, read straight from the source
 * with the TypeScript parser (no app code runs). Google Core App Quality asks for a spoken label
 * on every control (Content_Description) and a 48 dp touch area (Touch_Target_Size).
 *
 * For every pressable element (Pressable, Touchable*, PressScale) in src/**.tsx:
 *  - "no label": no accessibilityLabel, not accessible={false}, and nothing to read inside (no
 *    text and no <Text>): TalkBack would say just "button".
 *  - "small target": an icon-only control (no text inside) with no hitSlop and no width / height /
 *    minHeight of at least 48 in its own style (inline, or its StyleSheet entry in the file; a
 *    number may be a const of the file or simple sums of them), and not a whole-area backdrop
 *    (flex: 1, or absolute with top and bottom) or a picture tile (aspectRatio).
 * Controls with words inside are measured by their text and padding at run time, which a source
 * read cannot do; the phone runs at the owner's 1.3 text size cover those.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { space } from '@/theme/tokens';

export const MIN_TARGET = 48;
const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'PressScale']);
const SIZE_KEYS = new Set(['height', 'minHeight', 'width', 'minWidth']);

export type Problem = { file: string; line: number; tag: string; kind: 'no label' | 'small target' };

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function tagName(n: ts.JsxOpeningLikeElement): string {
  return n.tagName.getText();
}

function attr(n: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const a of n.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  }
  return undefined;
}
const hasSpread = (n: ts.JsxOpeningLikeElement): boolean => n.attributes.properties.some(ts.isJsxSpreadAttribute);

/** Does anything inside read as words (JSX text, a <Text>, or an {expression} child)? */
function hasWords(el: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (ts.isJsxSelfClosingElement(el)) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isJsxText(n) && n.getText().trim() !== '') found = true;
    else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /(^|\.)Text$|Label$|Title$/.test(tagName(n))) found = true;
    // A child drawing its own words from a prop (<Badge label=…>, <SettingRow title=…>).
    else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && (attr(n, 'label') || attr(n, 'title'))) found = true;
    else if (ts.isJsxExpression(n) && n.parent && ts.isJsxElement(n.parent) && n.expression && !ts.isJsxElement(n.expression) && !ts.isJsxSelfClosingElement(n.expression) && !ts.isConditionalExpression(n.expression) && !ts.isBinaryExpression(n.expression)) found = true;
    else ts.forEachChild(n, visit);
  };
  for (const c of el.children) visit(c);
  return found;
}

type Consts = Map<string, ts.Expression>;

/** The value of a number expression: literals, the file's consts, + - * / of them. */
function numberOf(e: ts.Expression | undefined, consts: Consts, depth = 0): number | null {
  if (!e || depth > 8) return null;
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isParenthesizedExpression(e)) return numberOf(e.expression, consts, depth + 1);
  // MIN_TOUCH (components/ui/a11y) is the 48 dp constant.
  if (ts.isIdentifier(e) && e.text === 'MIN_TOUCH') return MIN_TARGET;
  if (ts.isIdentifier(e)) return numberOf(consts.get(e.text), consts, depth + 1);
  // The spacing tokens (space.sm ...), from the theme package itself.
  if (ts.isPropertyAccessExpression(e) && e.expression.getText() === 'space') {
    const v = (space as Record<string, unknown>)[e.name.getText()];
    return typeof v === 'number' ? v : null;
  }
  if (ts.isBinaryExpression(e)) {
    const a = numberOf(e.left, consts, depth + 1);
    const b = numberOf(e.right, consts, depth + 1);
    if (a == null || b == null) return null;
    switch (e.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken: return a + b;
      case ts.SyntaxKind.MinusToken: return a - b;
      case ts.SyntaxKind.AsteriskToken: return a * b;
      case ts.SyntaxKind.SlashToken: return a / b;
      default: return null;
    }
  }
  return null;
}

function numberAtLeast(e: ts.Expression | undefined, min: number, consts: Consts): boolean {
  if (!e) return false;
  if (ts.isConditionalExpression(e)) return numberAtLeast(e.whenTrue, min, consts) && numberAtLeast(e.whenFalse, min, consts);
  const v = numberOf(e, consts);
  return v != null && v >= min;
}

function objectBigEnough(o: ts.ObjectLiteralExpression, consts: Consts): boolean {
  const keys = new Map<string, ts.Expression>();
  for (const p of o.properties) if (ts.isPropertyAssignment(p)) keys.set(p.name.getText(), p.initializer);
  for (const [k, v] of keys) if (SIZE_KEYS.has(k) && numberAtLeast(v, MIN_TARGET, consts)) return true;
  // A backdrop that fills its parent, or a picture tile drawn by its aspect ratio.
  if (keys.has('flex') && numberOf(keys.get('flex'), consts) === 1) return true;
  if (keys.get('position')?.getText().includes('absolute') && keys.has('top') && keys.has('bottom')) return true;
  if (keys.has('aspectRatio')) return true;
  return false;
}

/** `const NAME = <expression>` anywhere in the file. */
function fileConsts(sf: ts.SourceFile): Consts {
  const out: Consts = new Map();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) out.set(n.name.text, n.initializer);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Style entries of StyleSheet.create({...}) calls in the file, by name. */
function sheetEntries(sf: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const out = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.getText(sf).endsWith('StyleSheet.create') && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
      for (const p of n.arguments[0].properties) {
        if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) out.set(p.name.getText(sf), p.initializer);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function styleBigEnough(e: ts.Expression | undefined, sheet: Map<string, ts.ObjectLiteralExpression>, consts: Consts): boolean {
  if (!e) return false;
  const again = (x: ts.Expression): boolean => styleBigEnough(x, sheet, consts);
  if (ts.isParenthesizedExpression(e)) return again(e.expression);
  if (ts.isObjectLiteralExpression(e)) return objectBigEnough(e, consts);
  if (ts.isArrayLiteralExpression(e)) return e.elements.some((x) => again(x as ts.Expression));
  if (ts.isPropertyAccessExpression(e)) {
    const entry = sheet.get(e.name.getText());
    return entry ? objectBigEnough(entry, consts) : false;
  }
  if (ts.isArrowFunction(e) && !ts.isBlock(e.body)) return again(e.body);
  if (ts.isConditionalExpression(e)) return again(e.whenTrue) && again(e.whenFalse);
  if (ts.isBinaryExpression(e)) return again(e.right);
  return false;
}

/** Every key of the object literals a style expression is built from (inline or StyleSheet). */
function styleKeys(e: ts.Expression | undefined, sheet: Map<string, ts.ObjectLiteralExpression>, out = new Map<string, ts.Expression>()): Map<string, ts.Expression> {
  if (!e) return out;
  if (ts.isParenthesizedExpression(e)) return styleKeys(e.expression, sheet, out);
  if (ts.isArrowFunction(e) && !ts.isBlock(e.body)) return styleKeys(e.body, sheet, out);
  if (ts.isArrayLiteralExpression(e)) for (const x of e.elements) styleKeys(x as ts.Expression, sheet, out);
  if (ts.isPropertyAccessExpression(e)) styleKeys(sheet.get(e.name.getText()), sheet, out);
  if (ts.isObjectLiteralExpression(e)) for (const p of e.properties) if (ts.isPropertyAssignment(p)) out.set(p.name.getText(), p.initializer);
  return out;
}

/**
 * hitSlop counts when what it adds reaches 48: the drawn size (the style's width / height, else
 * the icon inside plus its padding) plus the slop on both sides. A 22 dp icon with hitSlop 8 is
 * a 38 dp target. Anything it cannot work out from the file is given the benefit of the doubt.
 */
function slopBigEnough(
  el: ts.JsxElement | ts.JsxSelfClosingElement,
  slop: ts.JsxAttribute | undefined,
  styleExpr: ts.Expression | undefined,
  sheet: Map<string, ts.ObjectLiteralExpression>,
  consts: Consts,
): boolean {
  if (!slop) return false;
  const e = slop.initializer && ts.isJsxExpression(slop.initializer) ? slop.initializer.expression : undefined;
  const n = numberOf(e, consts);
  if (n == null) return true;
  const keys = styleKeys(styleExpr, sheet);
  const dims = ['width', 'height']
    .map((k) => numberOf(keys.get(k) ?? keys.get(k === 'width' ? 'minWidth' : 'minHeight'), consts))
    .filter((v): v is number => v != null);
  let base: number | null = dims.length > 0 ? Math.min(...dims) : null;
  if (base == null && ts.isJsxElement(el)) {
    let icon: number | null = null;
    for (const c of el.children) {
      const o = ts.isJsxSelfClosingElement(c) ? c : ts.isJsxElement(c) ? c.openingElement : null;
      if (!o || !/Icon$|Glyph$/.test(tagName(o))) continue;
      const size = attr(o, 'size');
      const v = size?.initializer && ts.isJsxExpression(size.initializer) ? numberOf(size.initializer.expression, consts) : null;
      if (v != null) icon = v;
    }
    if (icon == null) return true;
    const pad = keys.has('padding') ? numberOf(keys.get('padding'), consts) : 0;
    if (pad == null) return true;
    base = icon + 2 * pad;
  }
  return base == null || base + 2 * n >= MIN_TARGET;
}

export function lintFile(path: string, root: string): Problem[] {
  return lintSource(readFileSync(path, 'utf8'), relative(root, path).split('\\').join('/'));
}

export function lintSource(text: string, file: string): Problem[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sheet = sheetEntries(sf);
  const consts = fileConsts(sf);
  const out: Problem[] = [];
  const visit = (n: ts.Node): void => {
    const el = ts.isJsxElement(n) ? n : ts.isJsxSelfClosingElement(n) ? n : null;
    const open = el ? (ts.isJsxElement(el) ? el.openingElement : el) : null;
    if (el && open && PRESSABLES.has(tagName(open))) {
      const line = sf.getLineAndCharacterOfPosition(open.getStart(sf)).line + 1;
      const tag = tagName(open);
      const acc = attr(open, 'accessible');
      const hidden = acc?.initializer && ts.isJsxExpression(acc.initializer) && acc.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword;
      const words = hasWords(el);
      // A spread ({...props}) may carry the label: the caller is linted instead.
      if (!hidden && !hasSpread(open)) {
        if (!attr(open, 'accessibilityLabel') && !words) out.push({ file, line, tag, kind: 'no label' });
        const style = attr(open, 'style');
        const styleExpr = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : undefined;
        if (!words && !styleBigEnough(styleExpr, sheet, consts) && !slopBigEnough(el, attr(open, 'hitSlop'), styleExpr, sheet, consts)) {
          out.push({ file, line, tag, kind: 'small target' });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function lintTree(srcDir: string, root: string): Problem[] {
  return tsxFiles(srcDir).flatMap((f) => lintFile(f, root));
}
