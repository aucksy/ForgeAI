/**
 * F146: wait until every picture of a share picture (the gym's logo, the two progress photos) is in
 * the phone's image memory, so the saved PNG has them. react-native-svg's Android `toDataURL` draws a
 * picture only from Fresco's bitmap memory and silently skips one that is still loading; React
 * Native's `Image.queryCache` reads that same memory, and `Image.getSize` loads a picture into it.
 * PURE with its two steps passed in (tests use fakes).
 */
export interface PictureMemory {
  /** href → 'memory' | 'disk' | 'disk/memory' for those found (React Native's Image.queryCache). */
  query: (hrefs: string[]) => Promise<Record<string, string>>;
  /** Load one picture into memory (React Native's Image.getSize does). */
  load: (href: string) => Promise<unknown>;
  wait: (ms: number) => Promise<void>;
}

/** The pictures not in memory yet, by a queryCache answer. PURE. */
export function notInMemory(hrefs: readonly string[], answer: Readonly<Record<string, string>>): string[] {
  return hrefs.filter((h) => !(answer[h] ?? '').includes('memory'));
}

/**
 * Ask, load what is missing, ask again — for up to `tries` rounds. Returns the pictures still
 * missing at the end (empty = ready). A failed question counts every picture as missing.
 */
export async function waitForPictures(hrefs: readonly string[], m: PictureMemory, tries = 12): Promise<string[]> {
  let missing = [...hrefs];
  for (let i = 0; i < tries; i += 1) {
    const answer = await m.query(missing).catch(() => ({}) as Record<string, string>);
    missing = notInMemory(missing, answer);
    if (missing.length === 0 || i === tries - 1) break;
    await Promise.all(missing.map((h) => m.load(h).catch(() => undefined)));
    await m.wait(250);
  }
  return missing;
}
