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

/** Audit IM-17: a share ForgeAI could not take (too big, or the sharing app gave no access). */
export interface SharedFileProblem {
  error: 'too_big' | 'unreadable';
}

/** What the import screen says about a share it could not take. PURE. */
export function shareProblemText(error: string | null | undefined): string | null {
  if (error === 'too_big') return 'That file is too big to import (over 50 MB). Export again from Hevy or Strong and share the new file.';
  if (error === 'unreadable') return 'ForgeAI couldn’t open that file. Share it again, or tap “Choose file” and pick it here.';
  return null;
}

/** How to read a shared file: a real spreadsheet (.xlsx / .xls) as bytes, anything else as text. PURE. */
export function sharedFileKind(f: Pick<SharedFile, 'name' | 'type'>): 'sheet' | 'text' {
  const n = f.name.toLowerCase();
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'sheet';
  if (f.type.includes('spreadsheetml')) return 'sheet';
  return 'text';
}

/** Calls `open` for a share that started the app, and for each one while it runs (IM-17: also one it could not take). */
export function listenForShares(open: (f: SharedFile | SharedFileProblem) => void): () => void {
  const n = phoneNative();
  if (!n) return () => undefined;
  const take = (): void => {
    void n
      .takeSharedFile()
      .then((f) => {
        if (f && 'error' in f && (f.error === 'too_big' || f.error === 'unreadable')) open({ error: f.error });
        else if (f && 'uri' in f && f.uri) open(f);
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
