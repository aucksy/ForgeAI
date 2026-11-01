/**
 * Owner, 1 Nov 2026: right after "Create my gym", the gym code and join link are shown once, so the
 * owner can send them to members straight away. "Create my gym" leaves a note for this tab; the panel
 * shows the card and removes the note. PURE apart from the storage calls, which never throw.
 */

export interface NewGym {
  gymId: string;
  name: string;
  joinCode: string;
}

export const NEW_GYM_KEY = 'forgeai.newGymReady';

/** The saved note, or null when it is missing or not one of ours. PURE. */
export function parseNewGym(raw: string | null): NewGym | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<NewGym> | null;
    if (!v || typeof v.joinCode !== 'string' || !v.joinCode.trim() || typeof v.gymId !== 'string') return null;
    return { gymId: v.gymId, name: typeof v.name === 'string' ? v.name : '', joinCode: v.joinCode.trim().toUpperCase() };
  } catch {
    return null;
  }
}

/** Left by "Create my gym" once the gym is made. */
export function rememberNewGym(gym: NewGym): void {
  try {
    sessionStorage.setItem(NEW_GYM_KEY, JSON.stringify(gym));
  } catch (e) {
    console.warn('[new gym] could not keep the gym code to show once', e);
  }
}

/** The note, if there is one (read on the first draw; removed by forgetNewGym once shown). */
export function peekNewGym(): NewGym | null {
  try {
    return parseNewGym(sessionStorage.getItem(NEW_GYM_KEY));
  } catch (e) {
    console.warn('[new gym] the gym code note could not be read', e);
    return null;
  }
}

/** The card was shown: it does not come back. */
export function forgetNewGym(): void {
  try {
    sessionStorage.removeItem(NEW_GYM_KEY);
  } catch (e) {
    console.warn('[new gym] could not remove the gym code note', e);
  }
}
