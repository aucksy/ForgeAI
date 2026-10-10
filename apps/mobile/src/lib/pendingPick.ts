/**
 * A picture the member took or picked while Android closed ForgeAI behind the camera or the
 * gallery (Phase 3, third review). Phones short of memory do this: the member shoots, taps ✓,
 * and lands back in a freshly started app — the picture was gone. expo-image-picker keeps
 * that last result for `getPendingResultAsync`. This remembers WHICH screen asked for it, so a
 * meal photo never turns up as a progress photo, and a pick that came back normally is never
 * added a second time (the note is cleared the moment the picker returns).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

export type PickPurpose = 'progress-photo' | 'exercise-media' | 'chat-photo';

const KEY = 'forgeai.pendingPick';

/** Where the note is kept (a file that survives the app being closed) — swappable for tests. */
export interface PickStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type Pending = ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null | undefined;

/** The picture inside a pending result, or null (cancelled, failed or nothing). PURE. */
export function pendingAsset(r: Pending): ImagePicker.ImagePickerAsset | null {
  if (!r || !('canceled' in r) || r.canceled) return null;
  return r.assets?.[0] ?? null;
}

/** The note: the purpose, and (audit Phase 4, EX-13) which item asked — "exercise-media|<id>". */
function noteOf(purpose: PickPurpose, target?: string): string {
  return target ? `${purpose}|${target}` : purpose;
}

/**
 * Open a picker, noting who asked until it comes back. `target` names the one thing the
 * picture is for (EX-13: the exercise being edited, or "new"), so after a restart it goes back
 * to that exercise and never into another one's form.
 */
export async function launchFor<T>(purpose: PickPurpose, launch: () => Promise<T>, store: PickStore = AsyncStorage, target?: string): Promise<T> {
  await store.setItem(KEY, noteOf(purpose, target)).catch(() => undefined);
  try {
    return await launch();
  } finally {
    await store.removeItem(KEY).catch(() => undefined);
  }
}

/**
 * The picture a restart left behind for this screen — once — or null. With a `target`, only
 * the picture noted for that same target is taken; another target's stays for its own form.
 */
export async function takePendingPick(
  purpose: PickPurpose,
  deps: { store: PickStore; pending: () => Promise<Pending> } = { store: AsyncStorage, pending: () => ImagePicker.getPendingResultAsync() },
  target?: string,
): Promise<ImagePicker.ImagePickerAsset | null> {
  const asked = await deps.store.getItem(KEY).catch(() => null);
  if (asked == null) return null;
  const bar = asked.indexOf('|');
  const askedPurpose = bar < 0 ? asked : asked.slice(0, bar);
  const askedTarget = bar < 0 ? null : asked.slice(bar + 1);
  if (askedPurpose !== purpose) return null;
  // A note for one exercise is never adopted by another exercise's form.
  if (askedTarget != null && target != null && askedTarget !== target) return null;
  await deps.store.removeItem(KEY).catch(() => undefined);
  return pendingAsset(await deps.pending().catch(() => null));
}
