// node --test deploy/panel  (CI: ci.yml "Panel Worker tests"). F201: the assistant's fixed catalogue.
// The pages must be real admin-app routes (read from CrmApp.tsx's Screen() and the screens it hands a section
// to), every menu page must be in the catalogue, and the tool schemas must fit Claude's strict tool-use limits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  AI_PAGE_IDS,
  CREDITS,
  EXAMPLE_GROUPS,
  EXAMPLES,
  PAGES,
  STRICT_LIMITS,
  TOOLS,
  TOOL_CREDITS,
  creditsFor,
  pagePath,
  toolByName,
  toolsForClaude,
} from './assistCatalogue.js';

const SRC = new URL('../../apps/dashboard/src/crm/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8');

// 03-design §2 A-F, by name. Renaming one breaks the server, the history rows and this list on purpose.
const DESIGN_TOOLS = [
  'list_members', 'who_owes', 'money_summary', 'attendance_summary', 'growth_summary', 'member_lookup',
  'week_summary', 'gym_numbers', 'how_to', 'draft_message', 'add_member', 'renew', 'record_payment', 'extend',
  'add_enquiry', 'add_expense', 'draft_workout_plan', 'draft_diet_plan', 'ask_back', 'open_page', 'cannot_do',
];

test('every tool in the design is in the catalogue, once, with a kind and its credits', () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [...DESIGN_TOOLS].sort());
  for (const t of TOOLS) {
    assert.ok(Object.hasOwn(CREDITS, t.kind), `${t.name}: kind ${t.kind}`);
    assert.equal(TOOL_CREDITS[t.name], CREDITS[t.kind]);
    assert.ok(t.description.length > 20 && t.description.length < 400, `${t.name}: description length`);
  }
  assert.deepEqual(CREDITS, { ask: 0, talk: 0, message: 1, change: 1, content: 3 });
  assert.equal(toolByName('draft_message').kind, 'message');
  assert.equal(toolByName('add_member').kind, 'change');
  assert.equal(toolByName('draft_diet_plan').kind, 'content');
  assert.equal(creditsFor([{ tool: 'who_owes' }, { tool: 'draft_message' }, { tool: 'draft_workout_plan' }]), 4);
  assert.equal(creditsFor([{ tool: 'nope' }]), 0);
});

/** Walks a schema; calls visit(node, path) for every node. */
function walk(node, path, visit) {
  visit(node, path);
  if (node.properties) for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`, visit);
  if (node.items) walk(node.items, `${path}[]`, visit);
}

const BANNED_KEYWORDS = ['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'pattern', '$ref', 'oneOf'];

test('schemas fit strict tool use: closed objects, nothing optional, no unions, no unsupported keywords', () => {
  let strict = 0;
  let optional = 0;
  let unions = 0;
  for (const t of toolsForClaude()) {
    if (t.strict) strict += 1;
    assert.equal(t.input_schema.type, 'object');
    walk(t.input_schema, t.name, (n, path) => {
      for (const k of BANNED_KEYWORDS) assert.ok(!(k in n), `${path}: ${k} is not supported in strict mode`);
      if (Array.isArray(n.type) || n.anyOf) unions += 1;
      if (n.enum) assert.ok(n.enum.every((v) => typeof v === 'string'), `${path}: enum of strings only`);
      if (n.type === 'object') {
        assert.equal(n.additionalProperties, false, `${path}: additionalProperties false`);
        const keys = Object.keys(n.properties);
        optional += keys.filter((k) => !n.required.includes(k)).length;
        assert.deepEqual([...n.required].sort(), [...keys].sort(), `${path}: every property required`);
      }
    });
  }
  assert.ok(strict <= STRICT_LIMITS.tools, `${strict} strict tools`);
  assert.ok(optional <= STRICT_LIMITS.optional, `${optional} optional properties`);
  assert.ok(unions <= STRICT_LIMITS.unions, `${unions} union properties`);
  // R-483 (13 Nov 2026): no tool is sent strict; all of them together made a grammar Claude refused (400).
  assert.ok(toolsForClaude().every((t) => !('strict' in t)), 'no strict tools in the ask call');
});

// ------------------------------------------------------------------ pages

/** The text of `case '<head>':` up to the next case in CrmApp's Screen(). */
function caseBlock(screen, head) {
  const at = screen.indexOf(head === undefined ? 'case undefined:' : `case '${head}':`);
  if (at < 0) return null;
  const next = screen.slice(at + 6).search(/\n\s+(case [^\n]+:|default:)/);
  return next < 0 ? screen.slice(at) : screen.slice(at, at + 6 + next);
}

// A section the case hands to a screen (`<MoneyScreen section={id} />`) is a real page when that screen's
// file names it. Keep in step with CrmApp's Screen().
const SECTION_FILES = {
  money: ['ui/screens/Money.tsx'],
  attendance: ['ui/screens/Attendance.tsx'],
  messages: ['ui/screens/Messages.tsx'],
  shop: ['shop/ShopScreen.tsx'],
  settings: ['ui/screens/Settings.tsx'],
  numbers: ['logic/ownerNumbers.ts'],
};

test('every page is a real route of the admin app', () => {
  const app = read('CrmApp.tsx');
  const screen = app.slice(app.indexOf('function Screen('));
  for (const p of PAGES) {
    const [head, sub] = p.path.replace(/^\//, '').split('/').map((s) => s || undefined);
    const block = caseBlock(screen, head);
    assert.ok(block, `${p.id}: no case for ${p.path}`);
    if (sub === undefined) continue;
    if (sub === ':id') {
      assert.match(block, /\bid\b/, `${p.id}: ${head} takes no id`);
      continue;
    }
    const inCase = block.includes(`'${sub}'`);
    const inFile = (SECTION_FILES[head] ?? []).some((f) => read(f).includes(`'${sub}'`));
    assert.ok(inCase || inFile, `${p.id}: ${p.path} is not a route`);
  }
});

test('pages: unique ids and paths, a name and one line each; pagePath fills ids', () => {
  assert.equal(new Set(PAGES.map((p) => p.id)).size, PAGES.length);
  assert.equal(new Set(PAGES.map((p) => p.path)).size, PAGES.length);
  for (const p of PAGES) {
    assert.match(p.id, /^[a-z][a-z-]*$/);
    assert.ok(p.name && p.does && p.does.length <= 90, p.id);
  }
  assert.equal(pagePath('plans'), '/plans');
  assert.equal(pagePath('member-profile', 'm 1'), '/members/m%201');
  assert.equal(pagePath('member-profile'), null);
  assert.equal(pagePath('nope'), null);
  assert.ok(!AI_PAGE_IDS.includes('member-profile') && AI_PAGE_IDS.includes('plans'));
});

test('every page in the menu (computer and phone More) has a catalogue page with the same name', () => {
  const byPath = new Map(PAGES.map((p) => [p.path, p]));
  const menus = [read('CrmApp.tsx'), read('ui/screens/More.tsx')];
  // The phone's More list is a menu of menus, not a page to send the owner to. /assistant is the assistant itself
  // (F201 screen step): it never sends the owner to its own page.
  const NOT_PAGES = new Set(['/more', '/assistant']);
  let seen = 0;
  for (const src of menus) {
    for (const m of src.matchAll(/path: '(\/[^']*)',(?:\s*group: '[a-z]+',)?\s*label: (?:t\()?(['"])(.+?)\2/g)) {
      const [, path, , label] = m;
      if (NOT_PAGES.has(path)) continue;
      seen += 1;
      const page = byPath.get(path);
      assert.ok(page, `menu page ${path} (${label}) is missing from PAGES`);
      assert.equal(page.name, label, `${path}: the menu says "${label}"`);
    }
  }
  assert.ok(seen >= 30, `read ${seen} menu rows (the pattern must still match the menus)`);
});

// ------------------------------------------------------------------ examples

const DEVANAGARI = /[ऀ-ॿ]/;

test('"Try saying" examples: about 30, every group, each mapped to a real tool and real field values', () => {
  assert.ok(EXAMPLES.length >= 28 && EXAMPLES.length <= 40, `${EXAMPLES.length} examples`);
  assert.equal(new Set(EXAMPLES.map((e) => e.text)).size, EXAMPLES.length);
  for (const g of EXAMPLE_GROUPS) assert.ok(EXAMPLES.filter((e) => e.group === g).length >= 4, g);
  assert.ok(EXAMPLES.filter((e) => DEVANAGARI.test(e.text)).length >= 3, 'a few in Devanagari');
  // R-471 / 03-design §8: no Diwali or other dated festival in the fixed list; festival ideas come from the panel's calendar.
  const DATED = /diwali|holi|eid|christmas|navratri|rakhi|new year|दिवाली|होली|ईद/i;
  assert.deepEqual(EXAMPLES.filter((e) => DATED.test(e.text)).map((e) => e.text), []);
  for (const e of EXAMPLES) {
    assert.ok(EXAMPLE_GROUPS.includes(e.group), e.text);
    const tool = toolByName(e.tool);
    assert.ok(tool, `${e.text}: tool ${e.tool}`);
    assert.ok(e.text.length <= 80, e.text);
    for (const [k, v] of Object.entries(e.expect ?? {})) {
      const field = tool.input_schema.properties[k];
      assert.ok(field, `${e.text}: ${e.tool} has no ${k}`);
      if (field.enum) assert.ok(field.enum.includes(v), `${e.text}: ${k}=${v}`);
    }
  }
  // Every kind of task is shown at least once.
  for (const kind of ['ask', 'message', 'change', 'content', 'talk']) {
    assert.ok(EXAMPLES.some((e) => toolByName(e.tool).kind === kind), kind);
  }
});
