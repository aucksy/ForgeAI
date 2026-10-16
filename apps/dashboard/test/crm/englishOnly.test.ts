/**
 * The admin app speaks plain English only (16 Oct 2026: the owner asked to remove Hinglish). A
 * guard so Hinglish words do not creep back into what an owner, a member or a poster reads.
 * Import still READS Hinglish and Hindi column names in an owner's Excel file (importMembers.ts),
 * so that file is left out.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../src/crm', import.meta.url));
const SKIP = new Set(['importMembers.ts']);
// Words that only appear in Hinglish. Each was on a screen before the switch was removed.
const HINGLISH = /\b(karo|kijiye|karein|nahi|aapka|aapke|aapko|judiye|dabaiye|daaliye|kholiye|baaki|wapas|hazri|shubhkamnayein|dhanyavaad|raseed|namaste)\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !SKIP.has(f) ? [p] : [];
  });
}

/** The quoted strings and JSX text of a file, without its comments. */
function words(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return noComments.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) ?? [];
}

describe('the admin app is in English only', () => {
  it('no Hinglish word in any string on a screen, a message or a poster', () => {
    const found: string[] = [];
    for (const f of files(ROOT)) {
      for (const w of words(readFileSync(f, 'utf8'))) if (HINGLISH.test(w)) found.push(`${f.slice(ROOT.length + 1)}: ${w.slice(0, 80)}`);
    }
    expect(found).toEqual([]);
  });

  it('the language switch is gone', () => {
    const all = files(ROOT).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all).not.toMatch(/\bsetCurrentLang\b|\bLangToggle\b|from '[./]*i18n'/);
  });
});
