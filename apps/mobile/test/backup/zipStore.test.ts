/** R-123: the backup's tiny ZIP writer and reader. Made-up bytes. */
import { describe, expect, it } from 'vitest';

import { copyEntry, crc32, listZipEntries, looksLikeZip, readEntry, utf8Decode, utf8Encode, ZipError, ZipWriter, type ZipSource } from '@/backup/zipStore';

async function build(add: (z: ZipWriter) => Promise<void>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const z = new ZipWriter({ write: (b) => void parts.push(b.slice()) }, new Date(2026, 9, 25, 10, 30, 0));
  await add(z);
  await z.finish();
  return Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
}
const source = (b: Uint8Array): ZipSource => ({ size: b.length, readAt: (o, n) => b.slice(o, o + n) });

describe('CRC-32 and UTF-8', () => {
  it('CRC-32 is the ZIP one, also in pieces', () => {
    const b = utf8Encode('123456789');
    expect(crc32(b)).toBe(0xcbf43926);
    expect(crc32(b.subarray(4), crc32(b.subarray(0, 4)))).toBe(0xcbf43926);
  });
  it('UTF-8 both ways, Hindi and emoji too, as Node does it', () => {
    for (const s of ['Bench press', 'बेंच प्रेस', 'Push 💪 day', '']) {
      expect(Buffer.from(utf8Encode(s)).toString('utf8')).toBe(s);
      expect(utf8Decode(Uint8Array.from(Buffer.from(s, 'utf8')))).toBe(s);
    }
  });
});

describe('a stored ZIP', () => {
  it('writes whole and streamed entries that read back byte for byte', async () => {
    const pic = Uint8Array.from({ length: 2_500_000 }, (_, i) => (i * 7) % 251);
    const zip = await build(async (z) => {
      await z.addBytes('backup.json', utf8Encode('{"a":"é"}'));
      const e = await z.begin('photos/progress-p1.jpg');
      for (let off = 0; off < pic.length; off += 1 << 20) await e.write(pic.subarray(off, Math.min(pic.length, off + (1 << 20))));
      await e.end();
    });
    expect(looksLikeZip(zip.subarray(0, 4))).toBe(true);
    const entries = await listZipEntries(source(zip));
    expect(entries.map((e) => e.name)).toEqual(['backup.json', 'photos/progress-p1.jpg']);
    expect(utf8Decode(await readEntry(source(zip), entries[0]))).toBe('{"a":"é"}');
    const out: Uint8Array[] = [];
    await copyEntry(source(zip), entries[1], (c) => void out.push(c.slice()), 300_000);
    expect(Buffer.compare(Buffer.concat(out.map((o) => Buffer.from(o))), Buffer.from(pic))).toBe(0);
  });

  it('local headers agree with the central directory (any unzip tool reads it)', async () => {
    const zip = await build(async (z) => z.addBytes('backup.json', utf8Encode('hello')));
    // Local header: signature, method 0, CRC and sizes as in the central directory.
    const b = Buffer.from(zip);
    expect(b.readUInt32LE(0)).toBe(0x04034b50);
    expect(b.readUInt16LE(8)).toBe(0);
    expect(b.readUInt32LE(14)).toBe(crc32(utf8Encode('hello')));
    expect(b.subarray(30 + 'backup.json'.length, 30 + 'backup.json'.length + 5).toString()).toBe('hello');
  });

  it('refuses a damaged photo (CRC), a compressed entry and a file that is not a ZIP', async () => {
    const zip = await build(async (z) => z.addBytes('backup.json', utf8Encode('hello world')));
    const broken = zip.slice();
    broken[30 + 'backup.json'.length] ^= 0xff;
    const [e] = await listZipEntries(source(broken));
    await expect(readEntry(source(broken), e)).rejects.toMatchObject({ problem: 'damaged' });
    await expect(readEntry(source(zip), { ...e, method: 8 })).rejects.toBeInstanceOf(ZipError);
    await expect(listZipEntries(source(utf8Encode('Date,Workout Name\n2026-10-01,Push')))).rejects.toMatchObject({ problem: 'not-zip' });
  });
});
