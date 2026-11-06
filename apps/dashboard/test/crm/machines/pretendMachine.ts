/**
 * A pretend eSSL / ZKTeco machine (F103 / T77). It talks to the real handler exactly the way an ADMS
 * machine does (the request shapes in docs/overhaul/research/R-entry-machines-india.md section 2A and
 * the open-source ADMS servers' curl examples): handshake, poll, punch upload, command answers.
 * Nothing leaves this computer: the store is the in-memory reference store.
 */

import { handleDevice, type DeviceReply, type StoredMachine } from '../../../src/crm/machines/handler';
import { MemoryStore } from '../../../src/crm/machines/memoryStore';
import { ZK_AC_CAPS, ZK_TA_CAPS } from '../../../src/crm/machines/entryMachine';

/** 6 Nov 2026, 07:00 India time, as epoch ms. */
export const MORNING = Date.UTC(2026, 10, 6, 1, 30, 0);

export function machineRow(over: Partial<StoredMachine> = {}): StoredMachine {
  const firmware = over.firmware ?? 'ta';
  return {
    id: 'm-front',
    gymId: 'gym-a',
    family: 'zk-adms',
    serial: 'CJDE231560123',
    name: 'Front door',
    firmware,
    caps: firmware === 'ac' ? ZK_AC_CAPS : ZK_TA_CAPS,
    tzMinutes: 330,
    paused: false,
    attlogStamp: null,
    operlogStamp: null,
    ...over,
  };
}

export class PretendMachine {
  /** Every exchange, for reading a failing test. */
  log: { req: string; reply: DeviceReply }[] = [];
  constructor(
    public store: MemoryStore,
    public serial = 'CJDE231560123',
    public eol: '\n' | '\r\n' = '\r\n',
  ) {}

  private async send(method: string, url: string, body = '', now = MORNING): Promise<DeviceReply> {
    const reply = await handleDevice({ method, url, body }, this.store, now);
    this.log.push({ req: `${method} ${url}`, reply });
    return reply;
  }

  handshake(now = MORNING): Promise<DeviceReply> {
    return this.send('GET', `/iclock/cdata?SN=${this.serial}&options=all&pushver=2.4.1&language=69`, '', now);
  }

  poll(now = MORNING): Promise<DeviceReply> {
    return this.send('GET', `/iclock/getrequest?SN=${this.serial}&INFO=Ver 8.0.4.2-20230701,12,10,345,192.168.1.201,10,7,12,1,111`, '', now);
  }

  /** Punches as [memberNo, "YYYY-MM-DD HH:MM:SS", verify]; status 0, workcode 0 like a real T&A machine. */
  punch(rows: readonly (readonly [string, string, string?])[], now = MORNING, stamp = '9999'): Promise<DeviceReply> {
    const body = rows.map(([pin, t, v]) => `${pin}\t${t}\t0\t${v ?? '1'}\t0\t0\t0\t0\t0\t0`).join(this.eol) + this.eol;
    return this.send('POST', `/iclock/cdata?SN=${this.serial}&table=ATTLOG&Stamp=${stamp}`, body, now);
  }

  raw(method: string, url: string, body = '', now = MORNING): Promise<DeviceReply> {
    return this.send(method, url, body, now);
  }

  /** Answer commands the way ZK does: "ID=<id>&Return=<code>&CMD=DATA". */
  answer(results: readonly (readonly [number, string])[], now = MORNING): Promise<DeviceReply> {
    const body = results.map(([id, code]) => `ID=${id}&Return=${code}&CMD=DATA`).join(this.eol) + this.eol;
    return this.send('POST', `/iclock/devicecmd?SN=${this.serial}`, body, now);
  }
}

/** A gym with one registered T&A machine and three members on numbers 1001-1003. */
export function gymWithMachine(over: Partial<StoredMachine> = {}): { store: MemoryStore; machine: PretendMachine; row: StoredMachine } {
  const store = new MemoryStore();
  const row = machineRow(over);
  store.addMachine(row);
  store.setNumber(row.gymId, '1001', 'mem-ravi');
  store.setNumber(row.gymId, '1002', 'mem-priya');
  store.setNumber(row.gymId, '1003', 'mem-arjun');
  return { store, machine: new PretendMachine(store, row.serial), row };
}
