/**
 * eSSL / ZKTeco "ADMS" (iclock PUSH) driver (F103 / T77 step 1). PURE: text in, text out. Never
 * throws on what a machine sends: a machine is a cheap box on a gym wall, and one garbled line must
 * not lose the other 300 punches in the same upload.
 *
 * The conversation (research R-entry-machines-india.md section 2A; open servers s0x90/zkteco-adms,
 * BNet.ZKTecoADMS, the Laravel ADMS packages):
 *   GET  /iclock/cdata?SN=X&options=all&pushver=..   handshake -> our options text
 *   POST /iclock/cdata?SN=X&table=ATTLOG&Stamp=..    punches, one per line -> "OK: <n>"
 *   POST /iclock/cdata?SN=X&table=OPERLOG            admin log, users, fingerprints -> "OK: <n>"
 *   POST /iclock/cdata?SN=X&table=rtlog              AC firmware live door events -> "OK"
 *   GET  /iclock/getrequest?SN=X&INFO=..             "anything for me?" -> "C:<id>:<cmd>" lines or "OK"
 *   POST /iclock/devicecmd?SN=X                      "ID=<id>&Return=<code>&CMD=<what>" lines -> "OK"
 *
 * Text encoding. Bodies are read as UTF-8 (bad bytes become U+FFFD, never an error). Names SENT to a
 * machine are cut to plain ASCII: most eSSL/ZK firmware shows Devanagari as boxes or stores it as
 * garbage (several encode names in their own code page), so a Hindi-only name goes as
 * "Member <no>". The member's real name stays in MettleUp; the machine only needs the number.
 *
 * NOT PROVEN without a real machine (marked "to confirm" below): the AC-firmware user fields
 * (StartTime/EndTime/Disable), the door-open command, the time-set encoding, DATA QUERY ATTLOG, and
 * which TimeZone form each firmware reads.
 */

import {
  epochToLocal,
  isValidCommand,
  localToEpoch,
  safeTzMinutes,
  type Machine,
  type MachineCommand,
  type Punch,
  type QueuedCommand,
} from './entryMachine';

/** The most lines read from one upload; a machine sends far fewer (ZK batches ~100-500). */
export const MAX_LINES = 5000;
/** ZK keeps 24 bytes for a name on most models. */
export const MAX_NAME = 24;

// ---------------------------------------------------------------- reading what the machine sends

/** Lines of a body, CRLF or LF or a lone CR, blanks and stray spaces at the ends dropped. PURE. */
export function lines(body: unknown): string[] {
  if (typeof body !== 'string' || body === '') return [];
  const out: string[] = [];
  for (const raw of body.split(/\r\n|\n|\r/)) {
    const l = raw.replace(/^[ \u0000\uFEFF]+|[ \u0000]+$/g, '');
    if (l !== '') out.push(l);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** The query string of a request path as a plain map; first value wins, keys as sent. PURE. */
export function query(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const s = String(search ?? '').replace(/^.*?\?/, '');
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = safeDecode(eq < 0 ? part : part.slice(0, eq));
    const v = eq < 0 ? '' : safeDecode(part.slice(eq + 1));
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s; // quiet: a stray % from a machine; keep the text as sent
  }
}

/** A serial number we will look up: letters, digits, - and _, 1-32 long. null for anything else. PURE. */
export function cleanSerial(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(s) ? s : null;
}

/** ZK verify codes -> how they proved who they are. PURE. */
export function verifyWord(code: string | undefined): string {
  switch ((code ?? '').trim()) {
    case '1': return 'finger';
    case '15': return 'face';
    case '25': return 'palm';
    case '2':
    case '4': return 'card';
    case '0':
    case '3': return 'password';
    default: return 'other';
  }
}

const TIME_RE = /^\d{4}-\d{1,2}-\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?$/;

/**
 * One ATTLOG line: "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify<TAB>workcode<TAB>...". Some
 * firmware pads with spaces instead of tabs; extra fields are ignored. null for a line that has no
 * usable member number or time. PURE.
 */
export function parseAttLine(line: string, tzMinutes: number): Punch | null {
  let pin: string | undefined;
  let time: string | undefined;
  let rest: string[] = [];
  if (line.includes('\t')) {
    const f = line.split('\t').map((x) => x.trim());
    [pin, time] = [f[0], f[1]];
    rest = f.slice(2);
  } else {
    const m = /^(\S+)\s+(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/.exec(line.trim());
    if (!m) return null;
    pin = m[1];
    time = m[2]!.replace(/\s+/, ' ');
    rest = (m[3] ?? '').split(/\s+/);
  }
  const memberNo = cleanPin(pin);
  if (memberNo === null || !time || !TIME_RE.test(time)) return null;
  const at = localToEpoch(time, tzMinutes);
  if (at === null) return null;
  return { memberNo, localTime: time, at, allowed: true, verify: verifyWord(rest[1]), reason: null };
}

/** PINs as numbers, the way ZK firmware stores them ("0042" -> "42"). PURE. */
function cleanPin(raw: string | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = String(Number(s));
  return n === '0' ? null : n;
}

export interface ParsedUpload {
  punches: Punch[];
  /** Lines we could not read, kept (first 20) for the machine's log. */
  bad: string[];
  /** Every non-blank line, read or not: what "OK: <n>" counts, so the machine never resends them. */
  lineCount: number;
}

/** A whole ATTLOG upload. PURE, never throws. */
export function parseAttlog(body: unknown, tzMinutes: number): ParsedUpload {
  const all = lines(body);
  const punches: Punch[] = [];
  const bad: string[] = [];
  for (const l of all) {
    const p = parseAttLine(l, tzMinutes);
    if (p) punches.push(p);
    else if (bad.length < 20) bad.push(l.slice(0, 120));
  }
  return { punches, bad, lineCount: all.length };
}

/** "key=value<TAB>key=value" -> map, keys as sent. PURE. */
export function fields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split('\t')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k && !(k in out)) out[k] = part.slice(eq + 1).trim();
  }
  return out;
}

/**
 * AC firmware's live door log (table=rtlog): "time=...<TAB>pin=...<TAB>event=...<TAB>verifytype=...".
 * event 0 = "opened after a normal verify"; anything else is kept as a refusal with its number (the
 * event list is to confirm on an AC machine). pin 0 = someone the machine did not know. PURE.
 */
export function parseRtlog(body: unknown, tzMinutes: number): ParsedUpload {
  const all = lines(body);
  const punches: Punch[] = [];
  const bad: string[] = [];
  for (const l of all) {
    const f = fields(l);
    const time = f.time ?? '';
    const at = TIME_RE.test(time) ? localToEpoch(time, tzMinutes) : null;
    const memberNo = cleanPin(f.pin);
    if (at === null || memberNo === null) {
      if (bad.length < 20) bad.push(l.slice(0, 120));
      continue;
    }
    const event = (f.event ?? '').trim();
    const allowed = event === '0';
    punches.push({
      memberNo, localTime: time, at, allowed,
      verify: verifyWord(f.verifytype), reason: allowed ? null : `event ${event.slice(0, 6) || '?'}`,
    });
  }
  return { punches, bad, lineCount: all.length };
}

/** What an OPERLOG upload told us: how many lines, and members enrolled AT the machine. */
export interface ParsedOperlog {
  lineCount: number;
  /** "USER PIN=..<TAB>Name=.." lines: someone was added or changed at the machine itself. */
  users: { memberNo: string; name: string }[];
  /** "FP PIN=..<TAB>FID=.." lines: a fingerprint was enrolled. The template itself is NOT kept. */
  fingerprints: { memberNo: string; finger: number }[];
}

/**
 * OPERLOG: admin actions ("OPLOG ..."), user records ("USER ...") and fingerprint templates
 * ("FP ..."). Fingerprint templates are biometric data: we read only WHO enrolled, never store the
 * template (DPDP; an owner decision before that ever changes). PURE, never throws.
 */
export function parseOperlog(body: unknown): ParsedOperlog {
  const all = lines(body);
  const users: ParsedOperlog['users'] = [];
  const fingerprints: ParsedOperlog['fingerprints'] = [];
  for (const l of all) {
    const m = /^(USER|FP|BIODATA)\s+(.*)$/.exec(l);
    if (!m) continue;
    const f = fields(m[2]!);
    const memberNo = cleanPin(f.PIN ?? f.Pin ?? f.pin);
    if (memberNo === null) continue;
    if (m[1] === 'USER') users.push({ memberNo, name: (f.Name ?? '').slice(0, 64) });
    else fingerprints.push({ memberNo, finger: Number(f.FID ?? f.No ?? 0) || 0 });
  }
  return { lineCount: all.length, users, fingerprints };
}

/** One answer to a command: "ID=12&Return=0&CMD=DATA". */
export interface CommandAnswer {
  id: number;
  code: string;
  cmd: string;
}

/** A devicecmd body (one answer per line; some firmware sends several). PURE, never throws. */
export function parseDeviceCmd(body: unknown): CommandAnswer[] {
  const out: CommandAnswer[] = [];
  for (const l of lines(body)) {
    const q = query('?' + l);
    const id = Number(q.ID ?? q.id);
    const code = (q.Return ?? q.return ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || !/^-?\d{1,6}$/.test(code)) continue;
    out.push({ id, code, cmd: (q.CMD ?? q.cmd ?? '').slice(0, 32) });
  }
  return out;
}

/** The INFO a machine sends with getrequest: "ver,users,fingers,punches,ip,...". PURE. */
export function parseInfo(info: string | undefined): { firmware: string | null; users: number | null; ip: string | null } {
  const f = String(info ?? '').split(',');
  const n = Number(f[1]);
  const ip = (f[4] ?? '').trim();
  return {
    firmware: f[0]?.trim() ? f[0].trim().slice(0, 64) : null,
    users: Number.isInteger(n) && n >= 0 ? n : null,
    ip: /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null,
  };
}

// ---------------------------------------------------------------- writing to the machine

/**
 * The handshake reply. Stamps tell the machine what we already hold, so it sends only newer
 * punches. TimeZone: whole hours as hours, India's 5:30 as minutes (330): newer firmware reads a
 * value outside -12..12 as minutes (to confirm per model; our own times never depend on it, we
 * convert with the machine row's own offset). PURE.
 */
export function handshakeReply(
  serial: string,
  stamps: { attlog: string | null; operlog: string | null },
  tzMinutes: number,
): string {
  const tz = safeTzMinutes(tzMinutes);
  const stamp = (s: string | null) => (s && /^\d{1,12}$/.test(s) ? s : 'None');
  return [
    `GET OPTION FROM: ${serial}`,
    `ATTLOGStamp=${stamp(stamps.attlog)}`,
    `OPERLOGStamp=${stamp(stamps.operlog)}`,
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=30',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog EnrollUser ChgUser',
    `TimeZone=${tz % 60 === 0 ? tz / 60 : tz}`,
    'Realtime=1',
    'Encrypt=None',
  ].join('\n');
}

/**
 * A name a machine can show and store: ASCII letters, digits, space, . and -; tabs and line breaks
 * removed (they would break the command); at most 24 characters; "Member <no>" when nothing is left
 * (a name written only in Hindi). PURE.
 */
export function nameForMachine(name: unknown, memberNo: string): string {
  const ascii = String(name ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 .'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return ascii || `Member ${memberNo}`.slice(0, MAX_NAME);
}

/** "2026-11-06" -> "20261106"; null -> "0" (no limit). AC user fields: to confirm. PURE. */
function acDate(day: string | null): string {
  return day ? day.replace(/-/g, '') : '0';
}

/**
 * ZK's packed clock for SET OPTIONS DateTime: seconds counted as if every month had 31 days from
 * 2000-01-01, in the machine's local time (pyzk's encode_time). To confirm on a real machine. PURE.
 */
export function zkPackedTime(ms: number, tzMinutes: number): number {
  const l = epochToLocal(ms, tzMinutes);
  const [y, mo, d, h, mi, s] = l.split(/[- :]/).map(Number) as [number, number, number, number, number, number];
  return ((((y - 2000) * 12 * 31 + (mo - 1) * 31 + (d - 1)) * 24 + h) * 60 + mi) * 60 + s;
}

/**
 * One command in ADMS words (without the "C:<id>:" head). T&A firmware uses the USERINFO table; AC
 * firmware the "user" table with dates and a Disable flag, plus door rights (to confirm). PURE.
 */
export function commandText(c: MachineCommand, machine: Pick<Machine, 'firmware' | 'tzMinutes'>): string {
  const ac = machine.firmware === 'ac';
  switch (c.type) {
    case 'upsert_member': {
      const name = nameForMachine(c.name, c.memberNo);
      if (!ac) {
        return `DATA UPDATE USERINFO PIN=${c.memberNo}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`;
      }
      return (
        `DATA UPDATE user CardNo=\tPin=${c.memberNo}\tPassword=\tGroup=0\tStartTime=${acDate(c.validFrom)}` +
        `\tEndTime=${acDate(c.validTo)}\tName=${name}\tPrivilege=0\tDisable=${c.active ? 0 : 1}`
      );
    }
    case 'remove_member':
      return ac ? `DATA DELETE user Pin=${c.memberNo}` : `DATA DELETE USERINFO PIN=${c.memberNo}`;
    case 'open_door': {
      const secs = Math.max(1, Math.min(60, Math.round(c.seconds) || 5));
      return ac ? `CONTROL DEVICE 010101${String(secs).padStart(2, '0')}` : 'AC_UNLOCK';
    }
    case 'set_time':
      return `SET OPTIONS DateTime=${zkPackedTime(c.at, machine.tzMinutes)}`;
    case 'fetch_missed_entries':
      return `DATA QUERY ATTLOG StartTime=${epochToLocal(c.from, machine.tzMinutes)}\tEndTime=${epochToLocal(c.to, machine.tzMinutes)}`;
  }
}

/** The getrequest reply: one "C:<id>:<command>" line each, or "OK" when there is nothing. PURE. */
export function commandsReply(cmds: readonly QueuedCommand[], machine: Pick<Machine, 'firmware' | 'tzMinutes'>): string {
  const out: string[] = [];
  for (const q of cmds) {
    if (!isValidCommand(q.command)) continue; // a bad stored row never blocks the queue
    out.push(`C:${q.id}:${commandText(q.command, machine)}`);
  }
  return out.length === 0 ? 'OK' : out.join('\n');
}
