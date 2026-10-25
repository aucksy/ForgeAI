/**
 * A tiny ZIP writer and reader for the backup file (R-123, 25 Oct 2026). PURE: bytes in, bytes out;
 * the phone's files are behind the small `ZipSink` / `ZipSource` interfaces, so a 500-workout,
 * 200-photo backup is written and read a piece at a time and never held in memory whole.
 *
 * Only what the backup needs:
 *  - entries are STORED (no compression): photos are JPEGs that do not shrink, and backup.json is
 *    small. Any ZIP tool opens the file; a file changed by another tool and saved compressed is
 *    refused with plain words (`ZipError('compressed')`).
 *  - names are UTF-8 (flag bit 11), times are the backup's own time.
 *  - a streamed entry (a photo copied in chunks) carries its CRC and sizes in a data descriptor
 *    after the data (flag bit 3); the central directory always has the real values, and the
 *    reader only ever trusts the central directory.
 *  - no ZIP64: a backup over 4 GB is refused before anything is written (`MAX_ZIP_BYTES`).
 */

export const MAX_ZIP_BYTES = 0xfffffffe;

/** Why a file could not be read as a backup ZIP. */
export type ZipProblem = 'not-zip' | 'compressed' | 'too-big' | 'damaged';

export class ZipError extends Error {
  readonly problem: ZipProblem;
  constructor(problem: ZipProblem, detail?: string) {
    super(`zip: ${problem}${detail ? ` (${detail})` : ''}`);
    this.name = 'ZipError';
    this.problem = problem;
  }
}

// ------------------------------------------------------------------ CRC-32 and UTF-8

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

/** CRC-32 (the ZIP one), continued from `crc` when the data comes in pieces. PURE. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  const t = table();
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** UTF-8 bytes of a string (Hermes needs no TextEncoder). PURE. */
export function utf8Encode(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 3);
  let p = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out[p++] = c;
    else if (c < 0x800) {
      out[p++] = 0xc0 | (c >> 6);
      out[p++] = 0x80 | (c & 63);
    } else if (c < 0x10000) {
      out[p++] = 0xe0 | (c >> 12);
      out[p++] = 0x80 | ((c >> 6) & 63);
      out[p++] = 0x80 | (c & 63);
    } else {
      out[p++] = 0xf0 | (c >> 18);
      out[p++] = 0x80 | ((c >> 12) & 63);
      out[p++] = 0x80 | ((c >> 6) & 63);
      out[p++] = 0x80 | (c & 63);
    }
  }
  return out.slice(0, p);
}

/** A string from UTF-8 bytes; a broken sequence becomes U+FFFD. PURE. */
export function utf8Decode(b: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  const flush = (): void => {
    parts.push(String.fromCharCode(...chunk));
    chunk = [];
  };
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let cp = 0xfffd;
    let n = 1;
    if (x < 0x80) cp = x;
    else if (x >= 0xc2 && x < 0xe0 && i + 1 < b.length && (b[i + 1] & 0xc0) === 0x80) {
      cp = ((x & 31) << 6) | (b[i + 1] & 63);
      n = 2;
    } else if (x >= 0xe0 && x < 0xf0 && i + 2 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80) {
      cp = ((x & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
      n = 3;
    } else if (x >= 0xf0 && x < 0xf5 && i + 3 < b.length && (b[i + 1] & 0xc0) === 0x80 && (b[i + 2] & 0xc0) === 0x80 && (b[i + 3] & 0xc0) === 0x80) {
      cp = ((x & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63);
      n = 4;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else chunk.push(cp);
    if (chunk.length > 8000) flush();
    i += n;
  }
  flush();
  return parts.join('');
}

// ------------------------------------------------------------------ little-endian helpers

function put16(a: Uint8Array, at: number, v: number): void {
  a[at] = v & 0xff;
  a[at + 1] = (v >>> 8) & 0xff;
}
function put32(a: Uint8Array, at: number, v: number): void {
  a[at] = v & 0xff;
  a[at + 1] = (v >>> 8) & 0xff;
  a[at + 2] = (v >>> 16) & 0xff;
  a[at + 3] = (v >>> 24) & 0xff;
}
const get16 = (a: Uint8Array, at: number): number => a[at] | (a[at + 1] << 8);
const get32 = (a: Uint8Array, at: number): number => (a[at] | (a[at + 1] << 8) | (a[at + 2] << 16) | (a[at + 3] << 24)) >>> 0;

/** MS-DOS date and time (local clock, as ZIP tools show them). PURE. */
export function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_DESCRIPTOR = 0x08074b50;
const FLAG_UTF8 = 0x0800;
const FLAG_DESCRIPTOR = 0x0008;

// ------------------------------------------------------------------ writing

/** Where the ZIP's bytes go, in order (a file opened for writing). */
export interface ZipSink {
  write(bytes: Uint8Array): void | Promise<void>;
}

interface Written {
  name: Uint8Array;
  flags: number;
  crc: number;
  size: number;
  offset: number;
}

/** Writes a stored ZIP to a sink, an entry at a time. Call `finish()` once at the end. */
export class ZipWriter {
  private readonly sink: ZipSink;
  private readonly when: { time: number; date: number };
  private at = 0;
  private readonly done: Written[] = [];
  private open = false;

  constructor(sink: ZipSink, when: Date = new Date()) {
    this.sink = sink;
    this.when = dosDateTime(when);
  }

  /** Bytes written so far. */
  get size(): number {
    return this.at;
  }

  private async emit(b: Uint8Array): Promise<void> {
    if (this.at + b.length > MAX_ZIP_BYTES) throw new ZipError('too-big');
    await this.sink.write(b);
    this.at += b.length;
  }

  private local(name: Uint8Array, flags: number, crc: number, size: number): Uint8Array {
    const h = new Uint8Array(30 + name.length);
    put32(h, 0, SIG_LOCAL);
    put16(h, 4, 20); // version needed: 2.0
    put16(h, 6, flags);
    put16(h, 8, 0); // stored
    put16(h, 10, this.when.time);
    put16(h, 12, this.when.date);
    put32(h, 14, crc);
    put32(h, 18, size);
    put32(h, 22, size);
    put16(h, 26, name.length);
    put16(h, 28, 0);
    h.set(name, 30);
    return h;
  }

  /** One whole entry whose bytes are already in memory (backup.json). */
  async addBytes(name: string, bytes: Uint8Array): Promise<void> {
    if (this.open) throw new Error('zip: an entry is still open');
    const n = utf8Encode(name);
    const crc = crc32(bytes);
    const offset = this.at;
    await this.emit(this.local(n, FLAG_UTF8, crc, bytes.length));
    await this.emit(bytes);
    this.done.push({ name: n, flags: FLAG_UTF8, crc, size: bytes.length, offset });
  }

  /** An entry written in pieces (a photo copied a chunk at a time). `end()` closes it. */
  async begin(name: string): Promise<{ write: (chunk: Uint8Array) => Promise<void>; end: () => Promise<void> }> {
    if (this.open) throw new Error('zip: an entry is still open');
    this.open = true;
    const n = utf8Encode(name);
    const flags = FLAG_UTF8 | FLAG_DESCRIPTOR;
    const offset = this.at;
    await this.emit(this.local(n, flags, 0, 0));
    let crc = 0;
    let size = 0;
    return {
      write: async (chunk) => {
        crc = crc32(chunk, crc);
        size += chunk.length;
        await this.emit(chunk);
      },
      end: async () => {
        const d = new Uint8Array(16);
        put32(d, 0, SIG_DESCRIPTOR);
        put32(d, 4, crc);
        put32(d, 8, size);
        put32(d, 12, size);
        await this.emit(d);
        this.done.push({ name: n, flags, crc, size, offset });
        this.open = false;
      },
    };
  }

  /** The central directory and its end record. Nothing may be added after. */
  async finish(): Promise<void> {
    if (this.open) throw new Error('zip: an entry is still open');
    const start = this.at;
    for (const e of this.done) {
      const c = new Uint8Array(46 + e.name.length);
      put32(c, 0, SIG_CENTRAL);
      put16(c, 4, 20); // made by: 2.0
      put16(c, 6, 20);
      put16(c, 8, e.flags);
      put16(c, 10, 0);
      put16(c, 12, this.when.time);
      put16(c, 14, this.when.date);
      put32(c, 16, e.crc);
      put32(c, 20, e.size);
      put32(c, 24, e.size);
      put16(c, 28, e.name.length);
      // extra, comment, disk, internal attributes: 0
      put32(c, 38, 0);
      put32(c, 42, e.offset);
      c.set(e.name, 46);
      await this.emit(c);
    }
    if (this.done.length > 0xffff) throw new ZipError('too-big', 'entries');
    const end = new Uint8Array(22);
    put32(end, 0, SIG_END);
    put16(end, 8, this.done.length);
    put16(end, 10, this.done.length);
    put32(end, 12, this.at - start);
    put32(end, 16, start);
    await this.emit(end);
  }
}

// ------------------------------------------------------------------ reading

/** A file opened for reading at any place. */
export interface ZipSource {
  size: number;
  readAt(offset: number, length: number): Uint8Array | Promise<Uint8Array>;
}

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  size: number;
  compressedSize: number;
  localOffset: number;
}

/** True when the first bytes are a ZIP's ("PK\3\4", or an empty ZIP's end record). PURE. */
export function looksLikeZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}

/** Every entry, from the central directory. Throws `ZipError` on anything this reader can't trust. */
export async function listZipEntries(src: ZipSource): Promise<ZipEntry[]> {
  if (src.size < 22) throw new ZipError('not-zip');
  const tailLen = Math.min(src.size, 22 + 0xffff);
  const tail = await src.readAt(src.size - tailLen, tailLen);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (get32(tail, i) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('not-zip');
  const count = get16(tail, end + 10);
  const cdSize = get32(tail, end + 12);
  const cdOffset = get32(tail, end + 16);
  if (cdOffset === 0xffffffff || count === 0xffff) throw new ZipError('too-big', 'zip64');
  if (cdOffset + cdSize > src.size) throw new ZipError('damaged', 'directory past the end');
  const cd = await src.readAt(cdOffset, cdSize);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || get32(cd, p) !== SIG_CENTRAL) throw new ZipError('damaged', `entry ${i}`);
    const nameLen = get16(cd, p + 28);
    const extraLen = get16(cd, p + 30);
    const commentLen = get16(cd, p + 32);
    const entry: ZipEntry = {
      name: utf8Decode(cd.subarray(p + 46, p + 46 + nameLen)),
      method: get16(cd, p + 10),
      crc: get32(cd, p + 16),
      compressedSize: get32(cd, p + 20),
      size: get32(cd, p + 24),
      localOffset: get32(cd, p + 42),
    };
    if (entry.localOffset + 30 + entry.compressedSize > src.size) throw new ZipError('damaged', entry.name);
    out.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Where an entry's data starts (after its own header). */
export async function entryDataOffset(src: ZipSource, e: ZipEntry): Promise<number> {
  const h = await src.readAt(e.localOffset, 30);
  if (h.length < 30 || get32(h, 0) !== SIG_LOCAL) throw new ZipError('damaged', e.name);
  const start = e.localOffset + 30 + get16(h, 26) + get16(h, 28);
  if (start + e.compressedSize > src.size) throw new ZipError('damaged', e.name);
  return start;
}

/** A whole stored entry's bytes, checked against its CRC (for backup.json). */
export async function readEntry(src: ZipSource, e: ZipEntry): Promise<Uint8Array> {
  if (e.method !== 0) throw new ZipError('compressed', e.name);
  const start = await entryDataOffset(src, e);
  const bytes = await src.readAt(start, e.size);
  if (bytes.length !== e.size || crc32(bytes) !== e.crc) throw new ZipError('damaged', e.name);
  return bytes;
}

/**
 * Copy a stored entry out a chunk at a time (a photo). `write` gets each piece in order; the CRC is
 * checked at the end, so a damaged photo is reported (the caller deletes what it wrote).
 */
export async function copyEntry(src: ZipSource, e: ZipEntry, write: (chunk: Uint8Array) => void | Promise<void>, chunkBytes = 1 << 20): Promise<void> {
  if (e.method !== 0) throw new ZipError('compressed', e.name);
  const start = await entryDataOffset(src, e);
  let crc = 0;
  for (let done = 0; done < e.size; ) {
    const n = Math.min(chunkBytes, e.size - done);
    const chunk = await src.readAt(start + done, n);
    if (chunk.length !== n) throw new ZipError('damaged', e.name);
    crc = crc32(chunk, crc);
    await write(chunk);
    done += n;
  }
  if (crc !== e.crc) throw new ZipError('damaged', e.name);
}
