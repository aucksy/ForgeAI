#!/usr/bin/env node
// Realtime machine test listener (R-38). Runs on a laptop on the SAME Wi-Fi as the machine and plays
// the part of Realtime's "Biometrics SDK PHP with Mongo" gateway (docs/overhaul/research/R-realtime-sdk.md):
// the machine POSTs to us with a `request_code` header (receive_cmd / send_cmd_result / realtime_glog /
// realtime_enroll_data); we answer receive_cmd with the next queued command. Its only job is to show
// whether this machine (e.g. the RS20) speaks that protocol, and what it sends back.
// Node 18+, no packages. Usage: node listener.mjs [port]   (default 8000). Type "help" for commands.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import readline from 'node:readline';

const PORT = Number(process.argv[2] || 8000);
const LOG = new URL('./realtime-test-log.txt', import.meta.url);
const queue = []; // {trans_id, cmd_code, cmd_param}
let nextTrans = 1;
let firstContact = null;

const stamp = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
function log(line) {
  const out = `[${stamp()}] ${line}`;
  console.log(out);
  try { fs.appendFileSync(LOG, out + '\n'); } catch (e) { console.warn('could not write the log file:', e.message); }
}

// Realtime's framing ("BSComm"): 4-byte little-endian length, then UTF-8 text ending in a NUL byte.
function bscomm(text) {
  if (!text) return Buffer.alloc(4);
  const body = Buffer.from(text, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length + 1);
  return Buffer.concat([len, body, Buffer.from([0])]);
}
function readBscommText(buf) {
  if (buf.length < 4) return null;
  const n = buf.readUInt32LE(0);
  if (n === 0 || n > buf.length - 4) return null;
  let end = 4 + n;
  if (buf[end - 1] === 0) end -= 1;
  return { text: buf.subarray(4, end).toString('utf8'), binaryBytes: Math.max(0, buf.length - 4 - n) };
}
// Fallback: the first {...} JSON in the body (the kit's extractLeadingJson does the same).
function leadingJson(buf) {
  const s = buf.toString('latin1');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return Buffer.from(s.slice(start, i + 1), 'latin1').toString('utf8');
  }
  return null;
}
function describeBody(buf) {
  if (!buf.length) return '(empty body)';
  const b = readBscommText(buf);
  const text = b ? b.text : leadingJson(buf);
  // Never print fingerprint / photo bytes: only their size.
  const extra = b && b.binaryBytes ? ` + ${b.binaryBytes} binary bytes (not shown)` : '';
  return text ? `${text.slice(0, 1500)}${extra}` : `${buf.length} bytes, no text found`;
}

function queueCmd(cmd_code, cmd_param) {
  const c = { trans_id: String(nextTrans++), cmd_code, cmd_param };
  queue.push(c);
  log(`QUEUED #${c.trans_id} ${cmd_code} ${cmd_param || '(no parameter)'}: the machine picks it up on its next poll`);
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const h = req.headers; // Node lower-cases header names
    const code = String(h['request_code'] || '').toLowerCase();
    const dev = h['dev_id'] || '?';
    if (!firstContact) {
      firstContact = new Date();
      log(`*** FIRST CONTACT from ${req.socket.remoteAddress}: the machine calls this laptop. Device id ${dev}.`);
    }
    if (code === 'receive_cmd') {
      const c = queue.shift();
      if (!c) {
        res.writeHead(200, { 'response_code': 'OK', 'Content-Type': 'application/octet-stream', 'Content-Length': 0 });
        return res.end();
      }
      const payload = bscomm(c.cmd_param);
      log(`SENT #${c.trans_id} ${c.cmd_code} to ${dev}`);
      res.writeHead(200, {
        'response_code': 'OK', 'trans_id': c.trans_id, 'cmd_code': c.cmd_code,
        'Content-Type': 'application/octet-stream', 'Content-Length': payload.length,
      });
      return res.end(payload);
    }
    if (code === 'send_cmd_result') log(`RESULT for #${h['trans_id'] || '?'}: ${h['cmd_return_code'] || '?'} | ${describeBody(body)}`);
    else if (code === 'realtime_glog') log(`ENTRY (finger scanned) from ${dev}: ${describeBody(body)}`);
    else if (code === 'realtime_enroll_data') log(`ENROLMENT data from ${dev}: ${describeBody(body)}`);
    else log(`UNKNOWN request ${req.method} ${req.url} headers=${JSON.stringify(h)} | ${describeBody(body)}`);
    res.writeHead(200, { 'response_code': 'OK', 'Content-Type': 'application/octet-stream', 'Content-Length': 0 });
    res.end();
  });
});

const ymdhms = (d) => d.replace(/-/g, '') + '000000';
const nowIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const HELP = `Commands (each is sent the next time the machine polls):
  users                       list the user numbers on the machine
  info <user>                 details of one user, e.g. info 00000002
  open                        open the door (the lock relay clicks)
  time                        set the machine clock to India time now
  logs <from> <to>            entries between two dates, e.g. logs 2026-10-01 2026-10-31
  block <user> <name>         disable a TEST user (name exactly as on the machine)
  unblock <user> <name>       enable that test user again
  dates <user> <name> <from> <to>   give a TEST user start and end dates (YYYY-MM-DD)
  raw <CMD_CODE> [json]       any other command from the kit
  queue                       what is waiting to be sent
  quit
Use block / unblock / dates ONLY on a test user you enrolled for this test, never on the gym's
admin or a real member: these commands rewrite that user's profile as an ordinary "user".`;
function profile(user, name, enabled, from, to) {
  return JSON.stringify({ user_id: user, user_name: name, user_privilege: 'user', user_depart_id: '0',
    user_enabled: enabled, User_Date_Range: from ? 'Use' : 'Not Use', From_Date: from || '', To_Date: to || '' });
}
function command(line) {
  const [cmd, ...a] = line.trim().split(/\s+/);
  switch ((cmd || '').toLowerCase()) {
    case '': return;
    case 'help': return console.log(HELP);
    case 'users': return queueCmd('GET_USER_ID_LIST', '');
    case 'info': return a[0] ? queueCmd('GET_USER_INFO', JSON.stringify({ user_id: a[0] })) : console.log('info <user>');
    case 'open': return queueCmd('OPEN_DOOR', JSON.stringify({ set_Door_comm: '1' }));
    case 'time': return queueCmd('SET_TIME', JSON.stringify({ time: nowIST() }));
    case 'logs': return a[1] ? queueCmd('GET_LOG_DATA', JSON.stringify({ begin_time: ymdhms(a[0]), end_time: ymdhms(a[1]).replace(/000000$/, '235959') })) : console.log('logs <from> <to>');
    case 'block': return a[1] ? queueCmd('SET_USER_PROFILE', profile(a[0], a.slice(1).join(' '), '0')) : console.log('block <user> <name>');
    case 'unblock': return a[1] ? queueCmd('SET_USER_PROFILE', profile(a[0], a.slice(1).join(' '), '1')) : console.log('unblock <user> <name>');
    case 'dates': return a[3] ? queueCmd('SET_USER_PROFILE', profile(a[0], a.slice(1, -2).join(' '), '1', a.at(-2), a.at(-1))) : console.log('dates <user> <name> <from> <to>');
    case 'raw': return a[0] ? queueCmd(a[0].toUpperCase(), a.slice(1).join(' ')) : console.log('raw <CMD_CODE> [json]');
    case 'queue': return console.log(queue.length ? queue.map((c) => `#${c.trans_id} ${c.cmd_code} ${c.cmd_param}`).join('\n') : 'nothing waiting');
    case 'quit': case 'exit': process.exit(0);
    default: console.log('Unknown command. Type help.');
  }
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  log(`Listening on port ${PORT}. On the machine, set the server address to one of: ${ips.join(', ') || '(no network found)'} and port ${PORT}.`);
  console.log('Waiting for the machine to call in... (type help for commands)');
  setTimeout(() => { if (!firstContact) log('No call from the machine in 3 minutes. Check: same Wi-Fi, the server IP/port on the machine, and the Windows firewall (allow Node).'); }, 180e3);
});
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', command);
