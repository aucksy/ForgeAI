/**
 * F137 "Busy machines": the calls to the gym server (supabase/migrations/0049_busy_by_exercise.sql). Every call
 * carries the owner or desk key; the server keeps each gym to its own list and lets only the owner save.
 *
 * Until 0049 is on the server, the first read answers PGRST202 ("no such function"): this page then remembers
 * "not here" for the life of the page, the Settings card and the screen stay hidden, with no error shown and one
 * quiet note in the console (the same as pause / renew requests, 0044). Any other failure is not remembered.
 */

import { isDemoLocked } from '../../lib/demoLock';
import { machineSetupFrom, type MachineSetup, type SaveMachine } from '../logic/busyMachines';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { call } from './api';

export type MachineServer = 'unknown' | 'yes' | 'no';

let server: MachineServer = 'unknown';

export function machineServer(): MachineServer {
  return isDemoLocked() ? 'no' : server;
}

function markNoServer(): void {
  if (server === 'no') return;
  server = 'no';
  console.info('[busy machines] this gym server has no busy machines yet (0049 not applied); the card stays hidden');
}

/** The switch, the machines and their weekly self-check. 'missing' when the server has not had 0049. */
export async function getMachineSetup(key: string): Promise<MachineSetup | 'missing'> {
  if (machineServer() === 'no') return 'missing';
  try {
    const s = machineSetupFrom(await call<unknown>('owner_machine_setup', { p_key: key }));
    server = 'yes';
    return s;
  } catch (e) {
    if (isNoSuchFunction(e)) {
      markNoServer();
      return 'missing';
    }
    throw e;
  }
}

/** Save the switch and the list (owner only). Throws OWNER_ONLY / INVALID / SUSPENDED as they came. */
export async function saveMachineSetup(key: string, enabled: boolean, machines: SaveMachine[]): Promise<MachineSetup> {
  return machineSetupFrom(await call<unknown>('owner_save_machine_setup', { p_key: key, p_enabled: enabled, p_machines: machines }));
}

/** Tests only: back to a fresh page. */
export function resetMachinesForTest(): void {
  server = 'unknown';
}
