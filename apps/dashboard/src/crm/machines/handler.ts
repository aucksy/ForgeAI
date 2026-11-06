/**
 * The thin web handler for eSSL / ZKTeco machines (F103 / T77 step 1). It only wires the ADMS
 * driver (adms.ts) to the core (entryMachine.ts) and to a store (the gym server in production,
 * memoryStore.ts in tests). The Worker that runs it is deploy/gate/worker.ts: NOT DEPLOYED.
 *
 * Who is let in. A machine sends no password, only its serial number, so a serial must be
 * registered to a gym first. Any other serial is answered politely (HTTP 200, never an error page)
 * but nothing it sends is saved, and the serial is logged so the owner's "add a machine" screen can
 * say "we can see a machine with serial X calling". Uploads from an unregistered machine are
 * answered "UNREGISTERED" (not "OK"), so the machine keeps its punches and sends them again once
 * the owner registers it (to confirm per firmware; the backstop is fetch_missed_entries).
 *
 * It never throws: a store outage answers "ERROR" with HTTP 200, and the machine retries later
 * (ErrorDelay) with its punches still on board.
 */

import {
  judgePunches,
  visitsFrom,
  type Machine,
  type MachineVisit,
  type PunchOutcome,
  type QueuedCommand,
  REPEAT_WINDOW_MS,
} from './entryMachine';
import {
  cleanSerial,
  commandsReply,
  handshakeReply,
  parseAttlog,
  parseDeviceCmd,
  parseInfo,
  parseOperlog,
  parseRtlog,
  query,
  type CommandAnswer,
  type ParsedUpload,
} from './adms';

/** A registered machine as the store returns it, with what we last heard from it. */
export interface StoredMachine extends Machine {
  attlogStamp: string | null;
  operlogStamp: string | null;
}

export interface SeenInfo {
  firmware?: string | null;
  users?: number | null;
  ip?: string | null;
  attlogStamp?: string | null;
  operlogStamp?: string | null;
}

/** Everything the handler needs from storage. All async; any of them may throw (an outage). */
export interface EntryStore {
  machineBySerial(serial: string): Promise<StoredMachine | null>;
  machineSeen(machineId: string, at: number, info: SeenInfo): Promise<void>;
  /** An unregistered serial called. Store at most one row per serial (last seen, count). */
  strangerSeen(serial: string, at: number, what: string): Promise<void>;
  /** Member number -> member id, for the numbers asked only. */
  memberNos(gymId: string, nos: readonly string[]): Promise<Map<string, string>>;
  /** The newest punch held per number on this machine since `since` (epoch ms). */
  recentPunches(machineId: string, nos: readonly string[], since: number): Promise<Map<string, number>>;
  /**
   * Keep every outcome except repeats (as punch-log rows; the exact same machine+number+time twice is
   * kept once) and write each visit unless that member already has one that day (the earliest wins).
   */
  savePunches(machine: StoredMachine, outcomes: readonly PunchOutcome[], visits: readonly MachineVisit[]): Promise<void>;
  /** Hand out due commands (pending -> sent, resends; the queue rules in entryMachine.takeForPoll). */
  takeCommands(machineId: string, now: number): Promise<QueuedCommand[]>;
  /** Record the machine's answers (the queue rules in entryMachine.applyResult). */
  commandResults(machineId: string, answers: readonly CommandAnswer[], now: number): Promise<void>;
}

/** A request as the handler needs it: no Request object, so tests and the Worker share it. */
export interface DeviceRequest {
  method: string;
  /** Path and query, e.g. "/iclock/cdata?SN=ABC&table=ATTLOG". */
  url: string;
  /** The body as text (UTF-8, bad bytes replaced). Empty for GET. */
  body: string;
}

export interface DeviceReply {
  status: number;
  body: string;
  /** What happened, for the Worker's log line and the tests. Never sent to the machine. */
  note: string;
}

const text = (body: string, note: string): DeviceReply => ({ status: 200, body, note });

/** Handle one machine request. Never throws. */
export async function handleDevice(req: DeviceRequest, store: EntryStore, now: number): Promise<DeviceReply> {
  try {
    return await route(req, store, now);
  } catch (e) {
    // The store failed (gym server down). The machine keeps its data and tries again later.
    const why = e instanceof Error ? e.message.slice(0, 80) : 'error';
    return text('ERROR', `store failed: ${why}`);
  }
}

async function route(req: DeviceRequest, store: EntryStore, now: number): Promise<DeviceReply> {
  const qAt = req.url.indexOf('?');
  const path = (qAt < 0 ? req.url : req.url.slice(0, qAt)).replace(/\/+$/, '').toLowerCase();
  const q = query(qAt < 0 ? '' : req.url.slice(qAt));
  const method = req.method.toUpperCase();
  const known = ['/iclock/cdata', '/iclock/getrequest', '/iclock/devicecmd', '/iclock/ping', '/iclock/registry', '/iclock/push'];
  if (!known.includes(path)) return { status: 404, body: 'Not found', note: 'not an iclock path' };

  const serial = cleanSerial(q.SN ?? q.sn);
  if (serial === null) return text('OK', 'no usable serial');

  const machine = await store.machineBySerial(serial);
  if (machine === null) {
    await store.strangerSeen(serial, now, `${method} ${path}`.slice(0, 40));
    // Uploads get a non-OK answer so the machine keeps them; polls and pings just get "OK".
    const isUpload = method === 'POST' && path === '/iclock/cdata';
    return text(isUpload ? 'UNREGISTERED' : 'OK', 'unregistered serial');
  }

  const info = parseInfo(q.INFO ?? q.info);
  if (machine.paused) {
    await store.machineSeen(machine.id, now, info);
    return text('OK', 'machine paused by the owner');
  }

  if (path === '/iclock/cdata' && method === 'GET') {
    await store.machineSeen(machine.id, now, info);
    return text(
      handshakeReply(serial, { attlog: machine.attlogStamp, operlog: machine.operlogStamp }, machine.tzMinutes),
      'handshake',
    );
  }

  if (path === '/iclock/cdata' && method === 'POST') {
    const table = String(q.table ?? '').toUpperCase();
    const stamp = /^\d{1,12}$/.test(q.Stamp ?? q.stamp ?? '') ? (q.Stamp ?? q.stamp)! : null;
    if (table === 'ATTLOG' || table === 'RTLOG') {
      const parsed = table === 'ATTLOG' ? parseAttlog(req.body, machine.tzMinutes) : parseRtlog(req.body, machine.tzMinutes);
      const saved = await savePunchUpload(machine, parsed, store);
      await store.machineSeen(machine.id, now, { ...info, ...(table === 'ATTLOG' && stamp ? { attlogStamp: stamp } : {}) });
      return text(table === 'ATTLOG' ? `OK: ${parsed.lineCount}` : 'OK', `${table}: ${saved}`);
    }
    if (table === 'OPERLOG') {
      const op = parseOperlog(req.body);
      await store.machineSeen(machine.id, now, { ...info, ...(stamp ? { operlogStamp: stamp } : {}) });
      return text(`OK: ${op.lineCount}`, `OPERLOG: ${op.lineCount} lines, ${op.users.length} users, ${op.fingerprints.length} fingers`);
    }
    // ATTPHOTO, options, BIODATA, anything new: accepted and not kept.
    await store.machineSeen(machine.id, now, info);
    return text('OK', `table ${table.slice(0, 20) || '(none)'} ignored`);
  }

  if (path === '/iclock/getrequest') {
    await store.machineSeen(machine.id, now, info);
    const cmds = await store.takeCommands(machine.id, now);
    return text(commandsReply(cmds, machine), `poll: ${cmds.length} commands`);
  }

  if (path === '/iclock/devicecmd') {
    const answers = parseDeviceCmd(req.body);
    if (answers.length > 0) await store.commandResults(machine.id, answers, now);
    await store.machineSeen(machine.id, now, info);
    return text('OK', `results: ${answers.length}`);
  }

  // ping / registry / push: alive, nothing else.
  await store.machineSeen(machine.id, now, info);
  return text('OK', path.slice(8));
}

async function savePunchUpload(machine: StoredMachine, parsed: ParsedUpload, store: EntryStore): Promise<string> {
  if (parsed.punches.length === 0) return `0 punches, ${parsed.bad.length} unreadable`;
  const nos = [...new Set(parsed.punches.map((p) => p.memberNo))];
  const earliest = Math.min(...parsed.punches.map((p) => p.at));
  const [lookup, recent] = await Promise.all([
    store.memberNos(machine.gymId, nos),
    store.recentPunches(machine.id, nos, earliest - REPEAT_WINDOW_MS),
  ]);
  const outcomes = judgePunches(parsed.punches, lookup, recent, machine.tzMinutes);
  const visits = visitsFrom(outcomes, machine.id);
  await store.savePunches(machine, outcomes, visits);
  const count = (k: PunchOutcome['kind']) => outcomes.filter((o) => o.kind === k).length;
  return (
    `${parsed.punches.length} punches: ${visits.length} visits, ${count('unknown-member')} unknown, ` +
    `${count('repeat')} repeats, ${count('refused')} refused, ${parsed.bad.length} unreadable`
  );
}

/** The Worker's side: a fetch Request -> a Response. Bodies over 2 MB are cut (a machine sends KBs). */
export async function handleDeviceFetch(request: Request, store: EntryStore, now: number): Promise<Response> {
  let body = '';
  if (request.method.toUpperCase() === 'POST') {
    try {
      const buf = await request.arrayBuffer();
      body = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 2 * 1024 * 1024));
    } catch {
      body = ''; // quiet: a broken upload reads as empty, answered "OK: 0"
    }
  }
  const u = new URL(request.url);
  const reply = await handleDevice({ method: request.method, url: u.pathname + u.search, body }, store, now);
  console.log(`[gate] ${request.method} ${u.pathname} -> ${reply.status} ${reply.note}`);
  return new Response(reply.body, {
    status: reply.status,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}
