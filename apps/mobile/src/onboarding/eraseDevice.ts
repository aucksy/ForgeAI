/**
 * "Erase all data" beyond the database (Phase 1 — DS-13, EX-04, SH-14, AI-14, PH-05).
 *
 * Erase means a fresh install: the next person to use this phone inherits nothing. The
 * database is wiped in `db/dataActions.ts`; this file clears what lives elsewhere:
 *   - the member's own exercise photos and videos (documents/exercise-media/, up to 80 MB each),
 *   - exported spreadsheets (documents/forgeai-*.xlsx) and the member's files in the app's
 *     cache (picked or shared import files, data files, share pictures, routine files),
 *   - the AI keys (SecureStore) — the next person must not spend the last one's credit,
 *   - the gym link and its signed-in session, and the Drive link,
 *   - the Shop: the sample shop's bag and demo orders, and the gym shop's member key and lists,
 *   - the app's settings (units, AI choices, tracker and phone preferences).
 *
 * NOT here, and said on the confirm instead: workouts already sent to Health Connect. Android
 * only lets an app remove what it can read back, and this erase must not hang on a permission
 * prompt; the member removes them in Health Connect.
 *
 * Every step is tried even when one before it fails — one stuck file must not leave the AI
 * keys behind. Device modules are imported lazily so the database layer stays light (and the
 * pure-TS tests can load it).
 */
export interface EraseStep {
  name: string;
  run: () => Promise<unknown>;
}

/**
 * Run every step; return the names of the ones that failed. Each failure is logged, and the
 * names reach the Erase button, which says what was left behind (silent-failure audit H1).
 */
export async function runEraseSteps(steps: readonly EraseStep[]): Promise<string[]> {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (e) {
      console.warn(`[ForgeErr] erase step "${step.name}" failed`, e);
      failed.push(step.name);
    }
  }
  return failed;
}

/** What each erase step clears, in the member's words. */
const STEP_WORDS: Record<string, string> = {
  'exercise-media': 'exercise photos and videos',
  exports: 'saved spreadsheets',
  cache: 'shared and imported files',
  'ai-keys': 'AI keys',
  'gym-link': 'gym sign-in',
  'drive-link': 'Google Drive link',
  settings: 'settings',
  shop: 'shop bag and orders',
  'gym-shop': 'gym shop',
  'pending-pick': 'picked photo',
};

/** PURE. A failed step's name in plain words. */
export function eraseStepWords(name: string): string {
  return STEP_WORDS[name] ?? name;
}

/**
 * PURE (audit H1). The message under "Erase all data" when the workouts went but some steps
 * did not: it names what is still on the phone and how to finish.
 */
export function eraseLeftBehindText(failed: readonly string[]): string {
  const words = [...new Set(failed.map(eraseStepWords))];
  const list = words.length <= 1 ? (words[0] ?? 'some data') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Your workouts were erased, but not your ${list}. Tap Erase all data to try again.`;
}

/** Files the app wrote into the documents folder for the member to share (spreadsheets). */
export function isExportFile(name: string): boolean {
  return /^forgeai-.*\.(xlsx|csv|json)$/i.test(name);
}

/**
 * The member's own data in the app's cache: exports and data files ("forgeai-…"), the picker's
 * and share sheet's copies, and imported files (a whole workout history). Not the cache as a
 * whole: Expo keeps the app's own sounds and fonts there while it runs.
 */
export function isPrivateCacheEntry(name: string): boolean {
  return /^forgeai/i.test(name) || /^(share|ImagePicker|DocumentPicker)$/i.test(name.replace(/\/$/, '')) || /\.(csv|xlsx|xls|json|db|sqlite)$/i.test(name);
}

interface FileApi {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  deleteAsync: (uri: string, options: { idempotent: boolean }) => Promise<void>;
  readDirectoryAsync: (uri: string) => Promise<string[]>;
}

/** The file steps, against the real folders on the phone or stand-ins in tests. PURE wiring. */
export function fileEraseSteps(fs: FileApi): EraseStep[] {
  const docs = fs.documentDirectory ?? '';
  const cache = fs.cacheDirectory ?? '';
  return [
    {
      name: 'exercise-media',
      run: async () => {
        if (docs) await fs.deleteAsync(`${docs}exercise-media/`, { idempotent: true });
      },
    },
    {
      name: 'exports',
      run: async () => {
        if (!docs) return;
        for (const name of await fs.readDirectoryAsync(docs)) {
          if (isExportFile(name)) await fs.deleteAsync(`${docs}${name}`, { idempotent: true });
        }
      },
    },
    {
      name: 'cache',
      run: async () => {
        if (!cache) return;
        for (const name of await fs.readDirectoryAsync(cache)) {
          if (isPrivateCacheEntry(name)) await fs.deleteAsync(`${cache}${name}`, { idempotent: true }).catch(() => undefined);
        }
      },
    },
  ];
}

/** Everything that is not a file. */
function deviceSteps(): EraseStep[] {
  return [
    {
      name: 'ai-keys',
      run: async () => {
        const keys = await import('@/lib/keys');
        // Every key is tried; any one left behind fails the step (audit H1: it never failed).
        const results = await Promise.allSettled([keys.setOpenAiKey(''), keys.setAnthropicKey(''), keys.setGroqKey('')]);
        const left = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (left) throw left.reason;
      },
    },
    {
      name: 'gym-link',
      run: async () => {
        const { signOutCloud } = await import('@/cloud/session');
        await signOutCloud();
      },
    },
    {
      name: 'drive-link',
      run: async () => {
        const { useBackup } = await import('@/store/backupStore');
        await useBackup.getState().unlinkGoogle();
      },
    },
    {
      name: 'settings',
      run: async () => {
        const { useSettings } = await import('@/store/settingsStore');
        useSettings.setState(useSettings.getInitialState(), true);
        const { useTrackerPrefs } = await import('@/tracker/store/trackerPrefsStore');
        useTrackerPrefs.setState(useTrackerPrefs.getInitialState(), true);
        const { usePhonePrefs } = await import('@/tracker/phone/phonePrefs');
        usePhonePrefs.getState().reset();
      },
    },
    {
      // S1: the Shop's bag and demo orders (AsyncStorage, not the database).
      name: 'shop',
      run: async () => {
        const { useShop } = await import('@/shop/shopStore');
        useShop.setState({ bag: [], orders: [] });
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem('forgeai-shop');
      },
    },
    {
      // S2: the gym's real shop — its member key, cached list, orders and bag. Forgotten on the
      // phone first; then the server is told the key is retired (best-effort, a few seconds at
      // most, so an erase offline never hangs).
      name: 'gym-shop',
      run: async () => {
        const { GYM_SHOP_STORAGE_KEY, useGymShop } = await import('@/shop/gymStore');
        const key = useGymShop.getState().link?.memberKey ?? null;
        useGymShop.getState().unlink(null);
        const { GYM_INBOX_STORAGE_KEY, useGymInbox } = await import('@/shop/inboxStore');
        useGymInbox.getState().clear();
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem(GYM_SHOP_STORAGE_KEY);
        await AsyncStorage.removeItem(GYM_INBOX_STORAGE_KEY);
        if (key) {
          const { apiLeaveQuietly } = await import('@/shop/gymApi');
          await apiLeaveQuietly(key);
        }
      },
    },
    {
      name: 'pending-pick',
      run: async () => {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem('forgeai.pendingPick');
      },
    },
  ];
}

/** Clear everything outside the database. Never throws. */
export async function eraseDeviceData(): Promise<string[]> {
  let files: EraseStep[] = [];
  try {
    const fs = await import('expo-file-system/legacy');
    files = fileEraseSteps(fs);
  } catch {
    // no file system (tests); the other steps still run
  }
  return runEraseSteps([...files, ...deviceSteps()]);
}

/**
 * PH-05: has this phone been sending workouts to Health Connect? Read BEFORE the erase (the
 * erase switches it off). Then the confirm says the copies there stay.
 */
export async function healthConnectWasUsed(): Promise<boolean> {
  try {
    const { usePhonePrefs } = await import('@/tracker/phone/phonePrefs');
    return usePhonePrefs.getState().healthConnect === true;
  } catch {
    return false;
  }
}
