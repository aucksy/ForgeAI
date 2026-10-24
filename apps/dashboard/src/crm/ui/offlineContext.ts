/**
 * Offline front desk, step 3 (owner #7): "Anything that cannot work offline is greyed out/disabled".
 * What every screen needs to know about the internet, provided by CrmProvider (store.tsx). Plain
 * data only (no UI imports), so the kit's Button can read it.
 */
import { createContext, useContext } from 'react';

export interface OfflineInfo {
  /** An online gym whose server cannot be reached right now. */
  offline: boolean;
  /** Ids of records made on this device that are not on the server yet ("Waiting to send"). */
  waitingIds: ReadonlySet<string>;
  /** How many things wait to be sent (refused ones included). */
  waiting: number;
  /** This device has its own receipt series (it can take payments offline). */
  canPayOffline: boolean;
}

export const NO_OFFLINE: OfflineInfo = { offline: false, waitingIds: new Set(), waiting: 0, canPayOffline: false };

export const OfflineContext = createContext<OfflineInfo>(NO_OFFLINE);

export function useOffline(): OfflineInfo {
  return useContext(OfflineContext);
}

/** Under a greyed-out button while offline. */
export const NEEDS_INTERNET_WORDS = 'Needs internet';
