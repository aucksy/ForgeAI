#!/usr/bin/env node
// Audit work-item state. Plain Node, no dependencies, runs in seconds and exits.
// Audit tooling only: it reads and writes files under docs/system-map/ and nothing else.
//
//   node state.mjs next 6                     next runnable items (status todo, every "needs" id done)
//   node state.mjs start <id> <run>           todo -> running, owner_run = <run>
//   node state.mjs done <id> <tokens> "<line>"   -> done, adds tokens to cost_tokens, result_line = <line>
//   node state.mjs fail <id> "<why>" [tokens] tries + 1; the 2nd fail makes the item blocked, else back to todo
//   node state.mjs add '<json>'               add one item (also: add @file.json, or add - to read stdin)
//   node state.mjs summary                    rewrites ONLY the "Learned cost" and "Work items" tables
//                                             in AUDIT-STATE.md, between their headings
// Helpers for the runbook rules (not in the plan's list):
//   node state.mjs reset <run>                every running item of a dead run -> todo (stale lock rule)
//   node state.mjs pct <number>               store PCT_PER_100K (5-hour % per 100,000 helper tokens)
//
// Optional: --dir <folder> (default: the folder above _tools, i.e. docs/system-map).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const di = args.indexOf('--dir');
if (di >= 0) { dir = path.resolve(args[di + 1]); args.splice(di, 2); }
const ITEMS = path.join(dir, 'work-items.jsonl');
const STATE = path.join(dir, 'AUDIT-STATE.md');
const META = path.join(dir, '_work', 'state-meta.json');
const FIELDS = ['id', 'step', 'item', 'needs', 'status', 'owner_run', 'tries', 'checkpoint', 'out_file', 'cost_tokens', 'result_line'];
const STATUSES = ['todo', 'running', 'done', 'blocked'];
const START_PCT = 5; // cost of one helper in 5-hour %, until a real cost is learned
const MAX_HELPERS = 6;

function die(msg) { console.error('state.mjs: ' + msg); process.exit(1); }

function load() {
  if (!fs.existsSync(ITEMS)) die('missing ' + ITEMS);
  const out = [];
  fs.readFileSync(ITEMS, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let o;
    try { o = JSON.parse(line); } catch (e) { die(`work-items.jsonl line ${i + 1} does not parse: ${e.message}`); }
    out.push(o);
  });
  const seen = new Set();
  for (const o of out) { if (seen.has(o.id)) die('duplicate id in work-items.jsonl: ' + o.id); seen.add(o.id); }
  return out;
}

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function save(items) {
  const text = items.map((o) => {
    const row = {};
    for (const f of FIELDS) row[f] = o[f];
    for (const k of Object.keys(o)) if (!(k in row)) row[k] = o[k];
    return JSON.stringify(row);
  }).join('\n') + '\n';
  writeAtomic(ITEMS, text);
}

function find(items, id) {
  const it = items.find((o) => o.id === id);
  if (!it) die('no work item with id ' + id);
  return it;
}

function missingNeeds(items, it) {
  const byId = new Map(items.map((o) => [o.id, o]));
  return (it.needs || []).filter((n) => !byId.has(n) || byId.get(n).status !== 'done');
}

function oneLine(s) { return String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim(); }
function cell(s) { return oneLine(s).replace(/\|/g, '/'); }

function readMeta() {
  try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch { return {}; }
}

function costRows(items) {
  // One row per step, in first-seen order. A "helper" = a done item that recorded tokens.
  const meta = readMeta();
  const pct = Number(meta.pct_per_100k) > 0 ? Number(meta.pct_per_100k) : null;
  const steps = [];
  const by = new Map();
  for (const o of items) {
    if (!by.has(o.step)) { by.set(o.step, { step: o.step, n: 0, tokens: 0, left: 0 }); steps.push(o.step); }
    const r = by.get(o.step);
    if (o.status === 'done' && Number(o.cost_tokens) > 0) { r.n += 1; r.tokens += Number(o.cost_tokens); }
    if (o.status === 'todo' || o.status === 'running') r.left += 1;
  }
  return steps.filter((s) => s !== 'coord' && (by.get(s).n > 0 || by.get(s).left > 0)).map((s) => {
    const r = by.get(s);
    const avg = r.n ? r.tokens / r.n : null;
    let costPct;
    let text;
    if (avg === null) { costPct = START_PCT; text = `${START_PCT} (start value)`; }
    else if (pct === null) { costPct = START_PCT; text = `${Math.round(avg / 1000)}k tokens (% not measured yet; plan with ${START_PCT})`; }
    else { costPct = avg / 100000 * pct; text = `${costPct.toFixed(1)} (${Math.round(avg / 1000)}k tokens)`; }
    return { ...r, avg, costPct, text };
  });
}

function replaceSection(lines, headingStart, body) {
  // Replaces the lines between the heading that starts with headingStart and the next "## " heading.
  const h = lines.findIndex((l) => l.startsWith(headingStart));
  if (h < 0) die(`AUDIT-STATE.md has no heading starting "${headingStart}"`);
  let end = lines.length;
  for (let i = h + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  const tail = lines.slice(end);
  const block = tail.length ? [...body, ''] : body;
  return [...lines.slice(0, h + 1), ...block, ...tail];
}

function summary(items) {
  if (!fs.existsSync(STATE)) die('missing ' + STATE);
  const raw = fs.readFileSync(STATE, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const endsWithEol = /\r?\n$/.test(raw);
  let lines = raw.split(/\r?\n/);
  if (endsWithEol) lines.pop();

  const costs = costRows(items);
  const costBody = ['| step | helpers so far | average cost |', '|---|---|---|',
    ...costs.map((r) => `| ${cell(r.step)} | ${r.n} | ${r.text} |`)];

  const label = { todo: 'todo', running: 'in progress', done: 'done', blocked: 'blocked' };
  const row = (o) => `| ${cell(o.id)} | ${cell(o.step)} | ${cell(o.item)} | ${label[o.status] || o.status} | ${cell(o.checkpoint) || '-'} | ${cell(o.result_line)} |`;
  const pick = (s) => items.filter((o) => o.status === s);
  const TODO_MAX = 25; const DONE_MAX = 8;
  const todo = pick('todo'); const done = pick('done');
  const count = (s) => pick(s).length;
  const workBody = [
    `Counts: ${count('todo')} todo, ${count('running')} in progress, ${count('done')} done, ${count('blocked')} blocked. Full list: work-items.jsonl. This table is written by _tools/state.mjs summary; do not edit it by hand.`,
    '',
    '| id | step | what | status (todo / in progress / done) | checkpoint file | helper result (1 line) |',
    '|---|---|---|---|---|---|',
    ...pick('running').map(row), ...pick('blocked').map(row), ...todo.slice(0, TODO_MAX).map(row),
    ...done.slice(-DONE_MAX).map(row),
  ];
  if (todo.length > TODO_MAX) workBody.push(`(+ ${todo.length - TODO_MAX} more todo items, not shown)`);
  if (done.length > DONE_MAX) workBody.push(`(+ ${done.length - DONE_MAX} older done items, not shown)`);

  lines = replaceSection(lines, '## Learned cost', costBody);
  lines = replaceSection(lines, '## Work items', workBody);
  writeAtomic(STATE, lines.join(eol) + (endsWithEol ? eol : ''));

  // For the projection line (the coordinator writes that line itself).
  const byStep = new Map(costs.map((r) => [r.step, r.costPct]));
  const auditF5 = items.filter((o) => o.status === 'todo' || o.status === 'running')
    .reduce((s, o) => s + (byStep.get(o.step) ?? START_PCT), 0);
  console.log(`summary written: ${items.length} items (${count('todo')} todo, ${count('running')} running, ${count('done')} done, ${count('blocked')} blocked)`);
  console.log(`AUDIT_F5 (cost of every todo and running item, in 5-hour %): ${auditF5.toFixed(1)}`);
}

const [cmd, ...rest] = args;
const items = load();

switch (cmd) {
  case 'next': {
    const n = Math.max(1, parseInt(rest[0] || String(MAX_HELPERS), 10) || MAX_HELPERS);
    const running = items.filter((o) => o.status === 'running');
    const ready = items.filter((o) => o.status === 'todo' && missingNeeds(items, o).length === 0);
    console.log(`running now: ${running.length}${running.length ? ' (' + running.map((o) => o.id).join(', ') + ')' : ''}; free helper seats: ${Math.max(0, MAX_HELPERS - running.length)} of ${MAX_HELPERS}; runnable: ${ready.length}`);
    for (const o of ready.slice(0, n)) console.log([o.id, o.step, oneLine(o.item), o.checkpoint || '-', o.out_file || '-', `tries ${o.tries || 0}`].join(' | '));
    break;
  }
  case 'start': {
    const [id, run] = rest;
    if (!id || !run) die('use: start <id> <run>');
    const it = find(items, id);
    if (it.status !== 'todo') die(`${id} is ${it.status}, not todo`);
    const miss = missingNeeds(items, it);
    if (miss.length) die(`${id} cannot start: needs not done: ${miss.join(', ')}`);
    it.status = 'running'; it.owner_run = run;
    save(items); console.log(`${id} running (run ${run})`);
    break;
  }
  case 'done': {
    const [id, tokens, ...lineParts] = rest;
    if (!id || tokens === undefined || !/^\d+$/.test(tokens)) die('use: done <id> <tokens> "<line>"  (tokens = a whole number, 0 if none)');
    const it = find(items, id);
    if (it.status === 'done') die(`${id} is already done`);
    it.status = 'done'; it.cost_tokens = (Number(it.cost_tokens) || 0) + Number(tokens);
    it.result_line = oneLine(lineParts.join(' '));
    save(items); console.log(`${id} done (${it.cost_tokens} tokens in all)`);
    break;
  }
  case 'fail': {
    const [id, why, tokens] = rest;
    if (!id || !why) die('use: fail <id> "<why>" [tokens]');
    const it = find(items, id);
    if (it.status === 'done') die(`${id} is already done`);
    it.tries = (Number(it.tries) || 0) + 1;
    if (tokens && /^\d+$/.test(tokens)) it.cost_tokens = (Number(it.cost_tokens) || 0) + Number(tokens);
    it.status = it.tries >= 2 ? 'blocked' : 'todo';
    it.result_line = `fail ${it.tries}: ${oneLine(why)}`;
    save(items);
    console.log(it.status === 'blocked'
      ? `${id} BLOCKED after ${it.tries} fails. Split it into two smaller items, or list it under Needs Aakash if only he can unblock it.`
      : `${id} back to todo (fail ${it.tries} of 2); its checkpoint and out file are kept`);
    break;
  }
  case 'add': {
    let src = rest.join(' ');
    if (src === '-') src = fs.readFileSync(0, 'utf8');
    else if (src.startsWith('@')) src = fs.readFileSync(src.slice(1), 'utf8');
    let o;
    try { o = JSON.parse(src); } catch (e) { die('add: the JSON does not parse: ' + e.message); }
    const list = Array.isArray(o) ? o : [o];
    for (const n of list) {
      for (const f of ['id', 'step', 'item']) if (typeof n[f] !== 'string' || !n[f].trim()) die(`add: "${f}" is required`);
      if (!/^[A-Za-z0-9._-]+$/.test(n.id)) die('add: id may hold only letters, digits, dot, dash, underscore: ' + n.id);
      if (items.some((x) => x.id === n.id)) die('add: id already exists: ' + n.id);
      n.needs = n.needs ?? [];
      if (!Array.isArray(n.needs)) die('add: needs must be a list of ids');
      for (const d of n.needs) if (!items.some((x) => x.id === d)) die(`add: needs names an unknown id: ${d}`);
      n.status = n.status ?? 'todo';
      if (!STATUSES.includes(n.status)) die('add: status must be one of ' + STATUSES.join(', '));
      n.owner_run = n.owner_run ?? ''; n.tries = n.tries ?? 0;
      n.checkpoint = n.checkpoint ?? `_work/${n.id}.md`;
      n.out_file = n.out_file ?? `_work/out/${n.id}.jsonl`;
      n.cost_tokens = n.cost_tokens ?? 0; n.result_line = n.result_line ?? '';
      items.push(n);
    }
    save(items); console.log(`added: ${list.map((n) => n.id).join(', ')}`);
    break;
  }
  case 'reset': {
    const [run] = rest;
    if (!run) die('use: reset <run>');
    const hit = items.filter((o) => o.status === 'running' && o.owner_run === run);
    for (const o of hit) o.status = 'todo';
    save(items); console.log(`reset ${hit.length} running item(s) of run ${run} to todo: ${hit.map((o) => o.id).join(', ') || '-'}`);
    break;
  }
  case 'pct': {
    const v = Number(rest[0]);
    if (!(v > 0)) die('use: pct <number>  (5-hour % per 100,000 helper tokens)');
    fs.mkdirSync(path.dirname(META), { recursive: true });
    writeAtomic(META, JSON.stringify({ ...readMeta(), pct_per_100k: v, set_on: new Date().toISOString() }) + '\n');
    console.log('PCT_PER_100K = ' + v);
    break;
  }
  case 'summary':
    summary(items);
    break;
  default:
    die('commands: next <n> | start <id> <run> | done <id> <tokens> "<line>" | fail <id> "<why>" [tokens] | add \'<json>\' | summary | reset <run> | pct <number>');
}
