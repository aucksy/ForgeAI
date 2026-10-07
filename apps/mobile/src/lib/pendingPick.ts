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

/** Open a picker, noting who asked until it comes back. */
export async function launchFor<T>(purpose: PickPurpose, launch: () => Promise<T>, store: PickStore = AsyncStorage): Promise<T> {
  await store.setItem(KEY, purpose).catch(() => undefined);
  try {
    return await launch();
  } finally {
    await store.removeItem(KEY).catch(() => undefined);
  }
}

/** The picture a restart left behind for this screen — once — or null. */
export async function takePendingPick(
  purpose: PickPurpose,
  deps: { store: PickStore; pending: () => Promise<Pending> } = { store: AsyncStorage, pending: () => ImagePicker.getPendingResultAsync() },
): Promise<ImagePicker.ImagePickerAsset | null> {
  const asked = await deps.store.getItem(KEY).catch(() => null);
  if (asked !== purpose) return null;
  await deps.store.removeItem(KEY).catch(() => undefined);
  return pendingAsset(await deps.pending().catch(() => null));
}
