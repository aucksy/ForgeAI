/**
 * v0.28.0 — a Hevy / Strong export shared to ForgeAI from Android's share menu opens the import
 * with that file (owner, 8 Oct 2026: "ForgeAI should be in the app options when sharing").
 * The native side copies the file into the app's cache; each share is taken once.
 */
import { phoneNative } from './native';

export interface SharedFile {
  uri: string;
  name: string;
  type: string;
}

/** How to read a shared file: a real spreadsheet (.xlsx / .xls) as bytes, anything else as text. PURE. */
export function sharedFileKind(f: Pick<SharedFile, 'name' | 'type'>): 'sheet' | 'text' {
  const n = f.name.toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'sheet';
  if (f.type.includes('spreadsheetml')) return 'sheet';
  return 'text';
}

/** Calls `open` for a share that started the app, and for each one while it runs. */
export function listenForShares(open: (f: SharedFile) => void): () => void {
  const n = phoneNative();
  if (!n) return () => undefined;
  const take = (): void => {
    void n
      .takeSharedFile()
      .then((f) => {
        if (f && f.uri) open(f);
      })
      .catch(() => undefined);
  };
  take();
  try {
    const sub = n.addListener('onSharedFile', take);
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
