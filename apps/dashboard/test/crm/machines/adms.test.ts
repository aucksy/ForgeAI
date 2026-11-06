// F103 / T77: the eSSL / ZKTeco ADMS driver (crm/machines/adms.ts). Pure text in, text out.
import { describe, expect, it } from 'vitest';

import {
  cleanSerial,
  commandsReply,
  commandText,
  handshakeReply,
  lines,
  nameForMachine,
  parseAttLine,
  parseAttlog,
  parseDeviceCmd,
  parseInfo,
  parseOperlog,
  parseRtlog,
  query,
  zkPackedTime,
} from '../../../src/crm/machines/adms';
import { localToEpoch, type QueuedCommand } from '../../../src/crm/machines/entryMachine';

const IST = 330;
const TA = { firmware: 'ta' as const, tzMinutes: IST };
const AC = { firmware: 'ac' as const, tzMinutes: IST };

describe('reading uploads', () => {
  it('reads a real-looking T&A ATTLOG line (10 tab fields)', () => {
    expect(parseAttLine('1001\t2026-11-06 07:15:30\t0\t1\t0\t0\t0\t0\t0\t0', IST)).toEqual({
      memberNo: '1001', localTime: '2026-11-06 07:15:30', at: localToEpoch('2026-11-06 07:15:30', IST),
      allowed: true, verify: 'finger', reason: null,
    });
  });
  it('reads face (15) and card (4), the minimum two fields, and space-padded firmware', () => {
    expect(parseAttLine('7\t2026-11-06 07:15:30\t0\t15', IST)?.verify).toBe('face');
    expect(parseAttLine('7\t2026-11-06 07:15:30\t0\t4', IST)?.verify).toBe('card');
    expect(parseAttLine('7\t2026-11-06 07:15:30', IST)?.verify).toBe('other');
    expect(parseAttLine('  42   2026-11-06 07:15:30   0   1  ', IST)).toMatchObject({ memberNo: '42', verify: 'finger' });
  });
  it('CRLF, LF, lone CR, a BOM and blank lines all read the same', () => {
    const rows = ['1001\t2026-11-06 07:00:00\t0\t1', '1002\t2026-11-06 07:01:00\t0\t1'];
    for (const eol of ['\n', '\r\n', '\r']) {
      const r = parseAttlog('﻿' + rows.join(eol) + eol + eol, IST);
      expect(r.punches.map((p) => p.memberNo)).toEqual(['1001', '1002']);
      expect(r.lineCount).toBe(2);
    }
  });
  it('garbage never throws: bad lines are kept aside, good ones still read', () => {
    const body = ['1001\t2026-11-06 07:00:00\t0\t1', 'hello', '\t\t\t', 'abc\t2026-11-06 07:00:00', '1003\t2026-13-45 99:00:00', '1004\t2026-11-06 07:02:00'].join('\n');
    const r = parseAttlog(body, IST);
    expect(r.punches.map((p) => p.memberNo)).toEqual(['1001', '1004']);
    expect(r.bad).toHaveLength(4);
    expect(r.lineCount).toBe(6);
    for (const junk of [undefined, null, 42, {}, '', '\u0000\u0001', 'x'.repeat(100000)]) {
      expect(() => parseAttlog(junk, IST)).not.toThrow();
      expect(() => parseOperlog(junk)).not.toThrow();
      expect(() => parseDeviceCmd(junk)).not.toThrow();
      expect(() => parseRtlog(junk, IST)).not.toThrow();
    }
  });
  it('a member number like 0042 is read as 42 (ZK keeps numbers), 0 is nobody', () => {
    expect(parseAttLine('0042\t2026-11-06 07:00:00', IST)?.memberNo).toBe('42');
    expect(parseAttLine('0\t2026-11-06 07:00:00', IST)).toBeNull();
  });
  it('reads AC live door events: event 0 = in, others = refused with the event number', () => {
    const r = parseRtlog('time=2026-11-06 07:00:00\tpin=1001\tcardno=0\teventaddr=1\tevent=0\tinoutstatus=0\tverifytype=1\r\n' +
      'time=2026-11-06 07:01:00\tpin=1002\tevent=27\tverifytype=15\r\n', IST);
    expect(r.punches.map((p) => [p.memberNo, p.allowed, p.reason, p.verify])).toEqual([
      ['1001', true, null, 'finger'], ['1002', false, 'event 27', 'face'],
    ]);
  });
  it('OPERLOG: who was enrolled at the machine; fingerprint templates are not kept', () => {
    const r = parseOperlog('OPLOG 4\t0\t2026-11-06 07:00:00\t0\t0\t0\t0\nUSER PIN=1001\tName=Ravi\tPri=0\tPasswd=\tCard=\tGrp=1\nFP PIN=1001\tFID=6\tSize=1184\tValid=1\tTMP=SECRETTEMPLATE\n');
    expect(r).toEqual({ lineCount: 3, users: [{ memberNo: '1001', name: 'Ravi' }], fingerprints: [{ memberNo: '1001', finger: 6 }] });
    expect(JSON.stringify(r)).not.toContain('SECRETTEMPLATE');
  });
  it('command answers, one or several per body; junk lines skipped', () => {
    expect(parseDeviceCmd('ID=12&Return=0&CMD=DATA\r\nID=13&Return=-1004&CMD=DATA\r\nID=x&Return=0\r\nID=14&Return=\r\n')).toEqual([
      { id: 12, code: '0', cmd: 'DATA' }, { id: 13, code: '-1004', cmd: 'DATA' },
    ]);
  });
  it('query strings, serials and INFO', () => {
    expect(query('/iclock/cdata?SN=ABC123&table=ATTLOG&Stamp=9999&bad=%E0%A4')).toEqual({ SN: 'ABC123', table: 'ATTLOG', Stamp: '9999', bad: '%E0%A4' });
    expect(cleanSerial('CJDE231560123')).toBe('CJDE231560123');
    for (const bad of ['', 'a b', "x';drop", 'x'.repeat(33), undefined]) expect(cleanSerial(bad)).toBeNull();
    expect(parseInfo('Ver 8.0.4.2,12,10,345,192.168.1.201')).toEqual({ firmware: 'Ver 8.0.4.2', users: 12, ip: '192.168.1.201' });
    expect(parseInfo(undefined)).toEqual({ firmware: null, users: null, ip: null });
  });
  it('lines() stops at 5000 lines', () => {
    expect(lines('1\n'.repeat(6000))).toHaveLength(5000);
  });
});

describe('writing to the machine', () => {
  it('the handshake: stamps, India time zone in minutes, no encryption', () => {
    const t = handshakeReply('CJDE231560123', { attlog: '123456', operlog: null }, IST).split('\n');
    expect(t[0]).toBe('GET OPTION FROM: CJDE231560123');
    expect(t).toContain('ATTLOGStamp=123456');
    expect(t).toContain('OPERLOGStamp=None');
    expect(t).toContain('TimeZone=330');
    expect(t).toContain('Realtime=1');
    expect(handshakeReply('X', { attlog: 'junk', operlog: null }, 60).split('\n')).toEqual(expect.arrayContaining(['ATTLOGStamp=None', 'TimeZone=1']));
  });
  it('T&A: add or update a member (USERINFO), and delete', () => {
    const up = { type: 'upsert_member' as const, memberNo: '1001', name: 'Ravi Kumar', active: true, validFrom: null, validTo: null };
    expect(commandText(up, TA)).toBe('DATA UPDATE USERINFO PIN=1001\tName=Ravi Kumar\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0');
    expect(commandText({ type: 'remove_member', memberNo: '1001' }, TA)).toBe('DATA DELETE USERINFO PIN=1001');
  });
  it('AC: dates and switched-off on the user record (to confirm on a real AC machine)', () => {
    const up = { type: 'upsert_member' as const, memberNo: '1001', name: 'Ravi', active: false, validFrom: '2026-10-01', validTo: '2026-11-30' };
    expect(commandText(up, AC)).toBe('DATA UPDATE user CardNo=\tPin=1001\tPassword=\tGroup=0\tStartTime=20261001\tEndTime=20261130\tName=Ravi\tPrivilege=0\tDisable=1');
    expect(commandText({ type: 'remove_member', memberNo: '1001' }, AC)).toBe('DATA DELETE user Pin=1001');
    expect(commandText({ type: 'open_door', seconds: 5 }, AC)).toBe('CONTROL DEVICE 01010105');
  });
  it('names: a Hindi-only name goes as "Member <no>", tabs and line breaks can never break a command', () => {
    expect(nameForMachine('रवि कुमार', '1001')).toBe('Member 1001');
    expect(nameForMachine('Ravi रवि Kumar', '1001')).toBe('Ravi Kumar');
    expect(nameForMachine('Evil\tPri=14\r\nC:1:DATA DELETE', '7')).not.toMatch(/[\t\r\n=:]/);
    expect(nameForMachine('Zoë Fernandes-D\'Souza the Third of Bandra', '7')).toBe("Zoe Fernandes-D'Souza th");
    expect(nameForMachine('', '7')).toBe('Member 7');
  });
  it('set time: ZK packed clock in the machine\'s local time', () => {
    // 2026-11-06 07:15:30 IST
    const at = Date.UTC(2026, 10, 6, 1, 45, 30);
    expect(zkPackedTime(at, IST)).toBe(((((26 * 12 * 31 + 10 * 31 + 5) * 24 + 7) * 60 + 15) * 60) + 30);
    expect(commandText({ type: 'set_time', at }, TA)).toBe(`SET OPTIONS DateTime=${zkPackedTime(at, IST)}`);
  });
  it('fetch missed entries asks for a window in local time', () => {
    const from = Date.UTC(2026, 10, 5, 18, 30, 0); // 6 Nov 00:00 IST
    expect(commandText({ type: 'fetch_missed_entries', from, to: from + 86_399_000 }, TA))
      .toBe('DATA QUERY ATTLOG StartTime=2026-11-06 00:00:00\tEndTime=2026-11-06 23:59:59');
  });
  it('the poll reply: "OK" when empty, else C:<id>:<command> lines', () => {
    expect(commandsReply([], TA)).toBe('OK');
    const q = (id: number, command: QueuedCommand['command']): QueuedCommand => ({
      id, machineId: 'm', command, status: 'sent', tries: 1, createdAt: 0, sentAt: 0, doneAt: null, result: null,
    });
    expect(commandsReply([q(7, { type: 'remove_member', memberNo: '5' }), q(8, { type: 'open_door', seconds: 3 })], TA))
      .toBe('C:7:DATA DELETE USERINFO PIN=5\nC:8:AC_UNLOCK');
  });
});
