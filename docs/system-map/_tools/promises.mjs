#!/usr/bin/env node
// A7-src: list every CANDIDATE promise sentence a user can read. No judging: a script, not an opinion.
// Plain Node, no packages, runs in seconds, exits.
//
//   node docs/system-map/_tools/promises.mjs            print the rows
//   node docs/system-map/_tools/promises.mjs --write    write docs/system-map/_sources/promises.txt + print the table
//   node docs/system-map/_tools/promises.mjs --sample 30   print 30 random rows (for the by-eye check)
//   --inflections   also match deleted / refunds / guaranteed / securely / privately (OFF by default: the
//                   audit brief says whole words)
//
// Row: source group | file:line | sentence (at most 300 characters, one line)
// A candidate = a user-readable sentence holding a trigger word. Every What's new line and every message
// template is a candidate even without one (mode 'all').

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'docs/system-map/_sources/promises.txt');
const ARGS = process.argv.slice(2);
const INFLECT = ARGS.includes('--inflections');

const GROUPS = ['legal', 'websites', 'store', 'help', 'panel', 'phone-watch', 'whats-new', 'templates'];

// ---------------------------------------------------------------------------------------------------------
// Where each source group lives. First rule that matches a file wins. mode: 'trigger' or 'all'.
// ---------------------------------------------------------------------------------------------------------
const PUB = 'apps/dashboard/public/';
const RULES = [
  // (8) message templates: WhatsApp, email, SMS, push
  { group: 'templates', mode: 'all', files: [
    'apps/dashboard/src/crm/logic/messageTemplates.ts',
    'apps/dashboard/src/crm/logic/whatsapp.ts',
    'apps/dashboard/src/crm/shop/messages.ts',
    'apps/mobile/src/shop/autoReminders.ts',
    'apps/mobile/src/shop/gymReminders.ts',
    'apps/mobile/src/shop/noticeAlertWords.ts',
    'apps/mobile/src/shop/pushPlan.ts',
    'apps/mobile/src/lib/helpReplyAlert.ts',
    'apps/mobile/src/tracker/services/workoutAlerts.ts',
    'deploy/panel/phoneInbound.js',
    'deploy/hq/push.js',
    'deploy/hq/panelPush.js',
  ] },
  { group: 'templates', mode: 'trigger', dirs: ['supabase/migrations'], exts: ['.sql'], name: /push|message|alert|notice|remind/i },
  // (7) What's new lines
  { group: 'whats-new', mode: 'all', files: [
    'apps/dashboard/src/crm/logic/whatsNew.ts',
    'apps/mobile/src/lib/whatsNew.ts',
  ] },
  // these two only fetch and show the lines above; they hold no lines of their own
  { group: 'whats-new', mode: 'trigger', files: ['apps/dashboard/src/crm/logic/hqNews.ts', 'deploy/panel/whatsNewFeed.js'] },
  // (4) help articles
  { group: 'help', mode: 'trigger', files: ['deploy/panel/helpArticles.js', 'deploy/panel/helpPages.js'] },
  // (1) legal pages (the served pages; docs/legal/*.body.html are their sources and would repeat every row)
  { group: 'legal', mode: 'trigger', files: ['privacy', 'terms', 'data-agreement', 'refund', 'delivery', 'delete-account'].map((n) => `${PUB}${n}.html`) },
  // (2) websites
  { group: 'websites', mode: 'trigger', dirs: [PUB], exts: ['.html', '.js'], skip: /\/(vendor|icons|brand)\/|\/sw\.js$/ },
  { group: 'websites', mode: 'trigger', files: ['gymPage', 'gymPageServe', 'friend', 'selfJoin', 'joinPay', 'appLink', 'pageChat', 'leads'].map((n) => `deploy/panel/${n}.js`) },
  // (3) store listing text and store screenshot text
  { group: 'store', mode: 'trigger', files: [
    'branding/mettleup/store/listing-draft.txt',
    'branding/mettleup/store/captions.json',
    'branding/mettleup/store/templates/slots.json',
  ] },
  // (5) panel in-app sentences (+ what the panel's server and the database answer with)
  { group: 'panel', mode: 'trigger', dirs: ['apps/dashboard/src'], exts: ['.ts', '.tsx'] },
  { group: 'panel', mode: 'trigger', files: ['apps/dashboard/index.html'] },
  // AI prompt files are words for the model, not for a user: left out.
  { group: 'panel', mode: 'trigger', dirs: ['deploy/panel'], exts: ['.js'], skip: /\/(help|assist|assistPlan|assistCatalogue|aiMatch|sqliteD1|payCrypto)\.js$|\/migrations\// },
  { group: 'panel', mode: 'trigger', dirs: ['supabase/migrations'], exts: ['.sql'] },
  // (6) phone and watch in-app sentences
  { group: 'phone-watch', mode: 'trigger', dirs: ['apps/mobile/src'], exts: ['.ts', '.tsx'], skip: /\/ai\/(system|tools)\.ts$/ },
  { group: 'phone-watch', mode: 'trigger', dirs: ['apps/mobile/android/wear/src/main'], exts: ['.kt', '.xml'] },
  { group: 'phone-watch', mode: 'trigger', dirs: ['apps/mobile/android/app/src/main/res'], exts: ['.xml'], name: /strings\.xml$/ },
  { group: 'phone-watch', mode: 'trigger', dirs: ['apps/mobile/modules'], exts: ['.kt', '.ts', '.tsx'] },
  { group: 'phone-watch', mode: 'trigger', files: ['apps/mobile/app.json'] },
];

const NEVER = /(^|\/)(node_modules|build|dist|\.gradle|__tests__|test|tests|e2e|e2e-live|qa|androidTest)(\/|$)|\.(test|spec|check)\.[a-z]+$|\.d\.ts$/;

function walk(dir, exts, acc) {
  let ents;
  try { ents = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const rel = `${dir.replace(/\/$/, '')}/${e.name}`;
    if (NEVER.test(rel)) continue;
    if (e.isDirectory()) walk(rel, exts, acc);
    else if (exts.includes(path.extname(e.name))) acc.push(rel);
  }
  return acc;
}

function fileList() {
  const seen = new Map();
  for (const r of RULES) {
    let list = [];
    if (r.files) list = r.files.filter((f) => fs.existsSync(path.join(ROOT, f)));
    for (const d of r.dirs || []) walk(d, r.exts, list);
    for (const f of list) {
      if (seen.has(f)) continue;
      if (r.skip && r.skip.test(f)) continue;
      if (r.name && !r.name.test(f)) continue;
      seen.set(f, r);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------------------------------------
// Trigger words
// ---------------------------------------------------------------------------------------------------------
const WORDS = ['we', 'never', 'only', 'free', 'recorded', 'always', 'guarantee', 'refund', 'delete', 'private', 'secure'];
if (INFLECT) WORDS.push('delet(?:ed|es|ing|ion)', 'refund(?:s|ed|able)', 'guarantee[ds]', 'privately', 'securely');
const NUM = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)';
const TRIGGER = new RegExp(
  `(?<![\\w-])(?:${WORDS.join('|')}|not\\s+kept|not\\s+shared)(?![\\w-])` +
  `|\\bwithin\\s+(?:about\\s+)?${NUM}(?:\\s*(?:-|to|or)\\s*${NUM})?\\s*(?:working\\s+|business\\s+)?(?:hours?|hrs?|days?|minutes?|mins?)\\b`,
  'i',
);

// ---------------------------------------------------------------------------------------------------------
// Scanners. Each returns blocks: { pieces: [{ text, line }] } = one string a user can read.
// ---------------------------------------------------------------------------------------------------------
const SKIP_LINE = /^\s*(import\b|export\s+\*|export\s+\{[^}]*\}\s+from\b|package\b)|\brequire\(|\bconsole\.\w+\(|\bLog\.[dweiv]\(|\blog(ger)?\.\w+\(|\bthrow\s+(new\s+)?\w*(Error|Exception)\(|\b(describe|it|test|expect|invariant|assert|debug|warn|track)\(/;
const ATTR_SKIP = /\b(className|class|testID|style|key|href|src|d|viewBox|data-[\w-]+)\s*=\s*\{?\s*$/;

const unesc = (ch, src, i) => {
  if (ch === 'n') return ['\n', 2];
  if (ch === 't') return [' ', 2];
  if (ch === 'r') return ['', 2];
  if (ch === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) return [String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)), 6];
  if (ch === 'x' && /^[0-9a-fA-F]{2}$/.test(src.slice(i + 2, i + 4))) return [String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)), 4];
  if (ch === '\n') return ['', 2];
  return [ch ?? '', 2];
};

function skipTemplate(src, i) { // i at the opening backtick; returns the index after the closing one
  i++;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') { i = matchBrace(src, i + 1) + 1; continue; }
    i++;
  }
  return i + 1;
}
function matchBrace(src, i) { // i at '{'; returns the index of its '}'
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) return i; }
    else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      i = j;
    } else if (c === '`') i = skipTemplate(src, i) - 1;
  }
  return src.length - 1;
}

const wordCount = (s) => (s.match(/[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F'’-]*/g) || []).length;
const KEYWORD = /^(import|export|const|let|var|return|if|else|for|while|switch|case|default|type|interface|function|async|await|public|private|protected|readonly|static|class|extends|new|throw|try|catch|typeof|as)\b/;

function isProseLine(t, cont) { // a JSX text line: plain words between tags
  const t2 = t.replace(/\{[^{}]{0,60}\}/g, '§').replace(/<\/?[A-Za-z][^<>]*>/g, ' ').trim();
  if (!t2) return false;
  if (/[=;{}<>|`[\]]|\/\/|\/\*|\*\//.test(t2)) return false;
  if (/[(&?+]$/.test(t2)) return false;
  if (cont) {
    if (!/^[A-Za-z0-9“"'‘₹(§]/.test(t2) || KEYWORD.test(t2)) return false;
    return wordCount(t2) >= 1;
  }
  if (!/^[A-Z0-9“₹]/.test(t2)) return false;
  return wordCount(t2) >= 3;
}

function scanCode(src, o = {}) {
  const { jsx = false, kotlin = false, lineBase = 0 } = o;
  const out = [];
  const lines = src.split('\n');
  const n = src.length;
  let i = 0, line = 1, prevSig = '', lastEnd = -1, cur = null, jsxLast = null;

  const addStr = (pieces, startIdx, endIdx) => {
    const startLine = pieces.length ? pieces[0].line - lineBase : line;
    const bad = SKIP_LINE.test(lines[startLine - 1] || '') || ATTR_SKIP.test(src.slice(Math.max(0, startIdx - 40), startIdx));
    if (cur && lastEnd >= 0 && /^\s*\+\s*$/.test(src.slice(lastEnd, startIdx))) {
      if (!cur.bad) cur.pieces.push(...pieces);
    } else {
      cur = { pieces: bad ? [] : pieces, bad };
      out.push(cur);
    }
    lastEnd = endIdx;
  };

  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') {
      line++; i++;
      if (jsx) {
        let e = src.indexOf('\n', i); if (e < 0) e = n;
        const t = src.slice(i, e).trim();
        const cont = !!jsxLast && jsxLast.endLine === line - 1;
        if (isProseLine(t, cont)) {
          if (cont) { jsxLast.block.pieces.push({ text: ' ' + t, line: line + lineBase }); jsxLast.endLine = line; }
          else { const b = { pieces: [{ text: t, line: line + lineBase }] }; out.push(b); jsxLast = { block: b, endLine: line }; }
          i = e;
        }
      }
      continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2); const stop = e < 0 ? n : e + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop; continue;
    }
    if (kotlin && c === '"' && src.startsWith('"""', i)) {
      const e = src.indexOf('"""', i + 3); const stop = e < 0 ? n : e;
      const pieces = src.slice(i + 3, stop).split('\n').map((text, k) => ({ text: text + '\n', line: line + k + lineBase }));
      const startIdx = i; line += pieces.length - 1; i = stop + 3;
      addStr(pieces, startIdx, i); prevSig = '"'; continue;
    }
    if (c === '"' || (c === "'" && !kotlin)) {
      const startIdx = i; let text = ''; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { const [t, adv] = unesc(src[i + 1], src, i); text += t; i += adv; continue; }
        text += src[i]; i++;
      }
      if (src[i] === c) i++;
      addStr([{ text, line: line + lineBase }], startIdx, i); prevSig = '"'; continue;
    }
    if (kotlin && c === "'") {
      const m = /^'(\\u[0-9a-fA-F]{4}|\\.|[^'\\\n])'/.exec(src.slice(i, i + 9));
      i += m ? m[0].length : 1; prevSig = '"'; continue;
    }
    if (c === '`' && !kotlin) {
      const startIdx = i; const pieces = []; let piece = { text: '', line: line + lineBase }; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { const [t, adv] = unesc(src[i + 1], src, i); if (src[i + 1] === '\n') line++; piece.text += t; i += adv; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          const e = matchBrace(src, i + 1);
          const expr = src.slice(i + 2, e);
          out.push(...scanCode(expr, { kotlin, lineBase: line - 1 + lineBase }));
          const x = expr.trim();
          piece.text += /^[\w.$[\]()?!' ]{1,40}$/.test(x) ? `{${x}}` : '{…}';
          for (const ch of expr) if (ch === '\n') line++;
          i = e + 1; continue;
        }
        if (src[i] === '\n') { piece.text += '\n'; pieces.push(piece); line++; piece = { text: '', line: line + lineBase }; i++; continue; }
        piece.text += src[i]; i++;
      }
      pieces.push(piece); i++;
      addStr(pieces, startIdx, i); prevSig = '"'; continue;
    }
    if (c === '/' && !kotlin && d !== '>' && (prevSig === '' || /[(,=:[!&|?{;]/.test(prevSig))) { // a regex literal
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      i = j + (src[j] === '/' ? 1 : 0); prevSig = '"'; continue;
    }
    if (jsx && c === '>' && src[i - 1] !== '=') {
      let e = i + 1;
      while (e < n && src[e] !== '<' && src[e] !== '{' && src[e] !== '\n') e++;
      const t = src.slice(i + 1, e).trim();
      const closeBeforeOpen = t.indexOf(')') >= 0 && (t.indexOf('(') < 0 || t.indexOf(')') < t.indexOf('('));
      if (t && wordCount(t) >= 2 && /^[A-Za-z0-9“"'‘₹(]/.test(t) && !/[=;|&`[\]]|\?\s|\s:\s/.test(t) && !closeBeforeOpen && !(src[e] === '\n' && wordCount(t) < 3)) {
        const b = { pieces: [{ text: t, line: line + lineBase }] };
        out.push(b);
        jsxLast = src[e] === '\n' ? { block: b, endLine: line } : null;
        i = e; prevSig = '>'; continue;
      }
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out.filter((b) => b.pieces.length);
}

function scanSql(src) {
  const out = []; const n = src.length; let i = 0, line = 1;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2); const stop = e < 0 ? n : e + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop; continue;
    }
    if (c === "'") {
      const startIdx = i; const pieces = []; let piece = { text: '', line }; i++;
      while (i < n) {
        if (src[i] === "'") { if (src[i + 1] === "'") { piece.text += "'"; i += 2; continue; } break; }
        if (src[i] === '\n') { piece.text += '\n'; pieces.push(piece); line++; piece = { text: '', line }; i++; continue; }
        piece.text += src[i]; i++;
      }
      pieces.push(piece); i++;
      const before = src.slice(Math.max(0, startIdx - 300), startIdx);
      // "comment on ..." is a note for developers; "raise notice/log" is a log line.
      if (!/comment\s+on\b[^;]*$/i.test(before) && !/raise\s+(notice|log|debug|info|warning)\s*$/i.test(before)) out.push({ pieces });
      continue;
    }
    i++;
  }
  return out;
}

const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'span', 'u', 'small', 'sup', 'sub', 'code', 'abbr', 'mark', 'wbr', 'bdi', 's', 'q', 'cite', 'time', 'kbd', 'nobr', 'font']);

function scanHtml(src) {
  const out = []; const n = src.length; let i = 0, line = 1; let cur = { pieces: [] };
  const flush = () => { if (cur.pieces.length) out.push(cur); cur = { pieces: [] }; };
  const countNl = (a, b) => { for (let k = a; k < b; k++) if (src[k] === '\n') line++; };
  while (i < n) {
    if (src[i] !== '<') {
      let e = src.indexOf('<', i); if (e < 0) e = n;
      for (const chunk of src.slice(i, e).split('\n').map((t, k) => ({ t, k }))) {
        if (chunk.t.trim()) cur.pieces.push({ text: ' ' + chunk.t.trim(), line: line + chunk.k });
      }
      countNl(i, e); i = e; continue;
    }
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); const stop = e < 0 ? n : e + 3; countNl(i, stop); i = stop; continue; }
    let e = src.indexOf('>', i); if (e < 0) e = n - 1;
    const tag = src.slice(i, e + 1);
    const name = (/^<\/?\s*([A-Za-z0-9:-]+)/.exec(tag) || [])[1]?.toLowerCase() || '';
    const closing = tag[1] === '/';
    if (!closing && (name === 'script' || name === 'style')) {
      const endTag = src.toLowerCase().indexOf(`</${name}`, e); const stop = endTag < 0 ? n : endTag;
      countNl(i, e + 1);
      if (name === 'script' && !/\bsrc\s*=/.test(tag)) { flush(); out.push(...scanCode(src.slice(e + 1, stop), { lineBase: line - 1 })); }
      countNl(e + 1, stop); i = stop; continue;
    }
    const tagLine = line;
    if (!closing) {
      for (const m of tag.matchAll(/\b(alt|title|placeholder|aria-label)\s*=\s*"([^"]*)"/g)) out.push({ pieces: [{ text: m[2], line: tagLine }] });
      if (name === 'meta' && /(name|property)\s*=\s*"(description|og:description|og:title|twitter:description|twitter:title)"/.test(tag)) {
        const m = /\bcontent\s*=\s*"([^"]*)"/.exec(tag); if (m) out.push({ pieces: [{ text: m[1], line: tagLine }] });
      }
    }
    if (!INLINE.has(name)) flush();
    countNl(i, e + 1); i = e + 1;
  }
  flush();
  return out;
}

function scanText(src) { // .txt / .md: each line is its own block
  return src.split('\n').map((t, k) => ({ pieces: [{ text: t, line: k + 1 }] })).filter((b) => b.pieces[0].text.trim());
}

// ---------------------------------------------------------------------------------------------------------
// Blocks -> sentences -> rows
// ---------------------------------------------------------------------------------------------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', middot: '·', rarr: '→', larr: '←', copy: '©', bull: '•', times: '×', zwnj: '', shy: '' };
function clean(s) {
  return s
    .replace(/<\/?[A-Za-z][^<>]*>/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, k) => (k in ENT ? ENT[k] : m))
    .replace(/\\'/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^(?:[-*•#>]+\s+)+/, '')
    .trim();
}

// Server files in mode 'all': a short lower-case string with no full stop is a reason code, not a message.
const STRICT_CASE = /^deploy\/(panel\/phoneInbound|hq\/push)\.js$/;

function readable(s, strict) {
  if (wordCount(s) < 3) return false;
  if (s.split(' ').filter((w) => /[A-Za-zऀ-ॿ]/.test(w)).length < 3) return false;
  if (/:\/\/|^\[[\w-]+\]|^\/[\w-]+\//.test(s)) return false; // links, "[tag] log line", paths
  if (strict && /^[a-z]/.test(s) && !/[.!?]$/.test(s)) return false;
  if (/=>|===|!==|&&|\|\||[{};]\s*$|\bfunction\s*\(|:\s*\d+px|rgba?\(|^\s*(select|insert\s+into|update\s+\w+\s+set|delete\s+from|create\s|alter\s|drop\s|grant\s|revoke\s)/i.test(s)) return false;
  if (/^[\w./:@#-]+(\s+[\w./:@#-]*[./:@#_][\w./:@#-]*)+$/.test(s)) return false; // paths, ids, class lists
  if (/\b[a-z]+_[a-z_]+\b/.test(s) && wordCount(s.replace(/\b\w*_\w*\b/g, '')) < 3) return false; // snake_case lists
  return true;
}

function sentences(text) { // [{ s, start }]
  const out = []; let start = 0;
  const push = (end) => { if (text.slice(start, end).trim()) out.push({ s: text.slice(start, end), start }); start = end; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { push(i + 1); continue; }
    if ('.!?।'.includes(c)) {
      let j = i + 1;
      while (j < text.length && '.!?"”’\')'.includes(text[j])) j++;
      if (j >= text.length) { push(j); break; }
      if (/\s/.test(text[j])) {
        let k = j; while (k < text.length && /[ \t]/.test(text[k])) k++;
        if (k >= text.length || !/[a-z,]/.test(text[k])) { push(j); i = j - 1; }
      }
    }
  }
  push(text.length);
  return out;
}

function rowsOfBlock(block, mode, strict) {
  let text = ''; const marks = [];
  for (const p of block.pieces) { marks.push({ at: text.length, line: p.line }); text += p.text; }
  const lineAt = (off) => { let l = marks[0].line; for (const m of marks) { if (m.at <= off) l = m.line; else break; } return l; };
  const sents = sentences(text).map((x) => {
    const lead = x.s.length - x.s.trimStart().length;
    return { s: clean(x.s), line: lineAt(x.start + lead) };
  }).filter((x) => x.s);
  const rows = [];
  if (mode === 'all') {
    const whole = clean(text);
    if (!readable(whole, strict)) return rows;
    let buf = null; // pack sentences into rows of at most 300 characters: nothing is cut off
    for (const x of sents) {
      if (buf && (buf.s + ' ' + x.s).length <= 300) buf.s += ' ' + x.s;
      else { if (buf) rows.push(buf); buf = { ...x }; }
    }
    if (buf) rows.push(buf);
  } else {
    for (const x of sents) if (TRIGGER.test(x.s) && readable(x.s)) rows.push(x);
  }
  return rows.map((r) => ({ line: r.line, s: r.s.length > 300 ? r.s.slice(0, 299) + '…' : r.s }));
}

function scanFile(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const ext = path.extname(rel);
  if (ext === '.html' || ext === '.xml') return scanHtml(src);
  if (ext === '.sql') return scanSql(src);
  if (ext === '.txt' || ext === '.md') return scanText(src);
  return scanCode(src, { jsx: ext === '.tsx', kotlin: ext === '.kt' });
}

function build() {
  const rows = [];
  for (const [rel, rule] of fileList()) {
    let seq = 0; const seen = new Set();
    for (const b of scanFile(rel)) {
      for (const r of rowsOfBlock(b, rule.mode, STRICT_CASE.test(rel))) {
        const k = `${r.line}|${r.s}`;
        if (seen.has(k)) continue; seen.add(k);
        rows.push({ g: GROUPS.indexOf(rule.group), group: rule.group, file: rel, line: r.line, seq: seq++, s: r.s });
      }
    }
  }
  // hinglish.ts is a table "English line: Hinglish line". Its English half repeats a line already listed from
  // the screen it belongs to: keep it only when no other file in the list carries the same sentence.
  const HING = 'apps/dashboard/src/crm/lang/hinglish.ts';
  const elsewhere = new Set(rows.filter((r) => r.file !== HING).map((r) => r.s));
  for (let k = rows.length - 1; k >= 0; k--) if (rows[k].file === HING && elsewhere.has(rows[k].s)) rows.splice(k, 1);
  rows.sort((a, b) => a.g - b.g || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.seq - b.seq);
  return rows.map((r) => `${r.group} | ${r.file}:${r.line} | ${r.s}`);
}

function table(lines) {
  const out = ['source group | first line | last line | count'];
  for (const g of GROUPS) {
    const first = lines.findIndex((l) => l.startsWith(g + ' | '));
    if (first < 0) { out.push(`${g} | - | - | 0`); continue; }
    let last = first; while (last + 1 < lines.length && lines[last + 1].startsWith(g + ' | ')) last++;
    const count = last - first + 1;
    out.push(`${g} | ${first + 1} | ${last + 1} | ${count}`);
    if (count > 120) {
      const parts = Math.ceil(count / 120);
      for (let p = 0; p < parts; p++) {
        const a = first + 1 + p * 120; const b = Math.min(first + (p + 1) * 120, last + 1);
        out.push(`  ${g} part ${p + 1}/${parts} | ${a} | ${b} | ${b - a + 1}`);
      }
    }
  }
  out.push(`TOTAL | 1 | ${lines.length} | ${lines.length}`);
  return out.join('\n');
}

const lines = build();
const si = ARGS.indexOf('--sample');
if (ARGS.includes('--write')) {
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log(table(lines));
} else if (si >= 0) {
  const want = Number(ARGS[si + 1]) || 30; const pick = new Set();
  while (pick.size < Math.min(want, lines.length)) pick.add(Math.floor(Math.random() * lines.length));
  for (const k of [...pick].sort((a, b) => a - b)) console.log(`${k + 1}: ${lines[k]}`);
} else if (ARGS.includes('--table')) {
  console.log(table(lines));
} else {
  console.log(lines.join('\n'));
}
