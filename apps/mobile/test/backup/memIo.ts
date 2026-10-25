/** An in-memory stand-in for the phone's files (src/backup/backupIo.ts), for the backup tests. */
import type { BackupIo, ReadHandle, WriteHandle } from '@/backup/backupIo';

export class MemIo implements BackupIo {
  files = new Map<string, Uint8Array>();
  cacheDir = 'file:///cache/';
  docDir = 'file:///docs/';
  free: number | null = 1e12;
  /** Largest single read asked for (the save and restore must read in pieces). */
  biggestRead = 0;

  freeBytes(): number | null {
    return this.free;
  }
  fileSize(uri: string): number | null {
    return this.files.get(uri)?.length ?? null;
  }
  openRead(uri: string): ReadHandle {
    const b = this.files.get(uri);
    if (!b) throw new Error(`no such file: ${uri}`);
    return {
      size: b.length,
      readAt: (offset, length) => {
        this.biggestRead = Math.max(this.biggestRead, length);
        return b.slice(offset, offset + length);
      },
      close: () => undefined,
    };
  }
  openWrite(uri: string): WriteHandle {
    const parts: Uint8Array[] = [];
    this.files.set(uri, new Uint8Array(0));
    return {
      write: (bytes) => {
        parts.push(bytes.slice());
      },
      close: () => {
        const n = parts.reduce((s, p) => s + p.length, 0);
        const all = new Uint8Array(n);
        let at = 0;
        for (const p of parts) {
          all.set(p, at);
          at += p.length;
        }
        this.files.set(uri, all);
      },
    };
  }
  remove(uri: string): void {
    this.files.delete(uri);
  }
  mkdir(): void {
    // folders are implied
  }
  list(dir: string): string[] {
    return [...this.files.keys()].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/')).map((k) => k.slice(dir.length));
  }
  put(uri: string, text: string | Uint8Array): void {
    this.files.set(uri, typeof text === 'string' ? Uint8Array.from(Buffer.from(text, 'utf8')) : text);
  }
}

/** Some picture-like bytes (not a real JPEG; the backup never looks inside). */
export function fakePicture(seed: number, size = 300_000): Uint8Array {
  const b = new Uint8Array(size);
  let x = seed * 2654435761;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
}
