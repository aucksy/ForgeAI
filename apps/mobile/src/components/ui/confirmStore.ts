/**
 * One app-wide "Are you sure?" question, answered in the app's own ConfirmSheet instead of
 * Android's grey Alert pop-up (Appendix D: "No Android stock pop-ups").
 *
 *   if (await askConfirm({ title: 'Delete this workout?', confirmLabel: 'Delete', destructive: true })) …
 *
 * Needs <ConfirmHost /> mounted once at the app root.
 */
import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  /** One short line under the title. */
  body?: string;
  confirmLabel: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** Red confirm button: for deletes and anything that throws work away. */
  destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
}

interface ConfirmState {
  request: ConfirmRequest | null;
}

export const useConfirmStore = create<ConfirmState>(() => ({ request: null }));

let nextId = 1;
const waiting = new Map<number, (ok: boolean) => void>();

/** Ask the member; resolves true on confirm, false on cancel / back / tap outside. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  const open = useConfirmStore.getState().request;
  if (open) answerConfirm(open.id, false); // never leave an earlier question hanging
  const id = nextId++;
  return new Promise<boolean>((resolve) => {
    waiting.set(id, resolve);
    useConfirmStore.setState({ request: { ...options, id } });
  });
}

/** Answer request `id`. A stale or repeated answer (a double tap) does nothing. */
export function answerConfirm(id: number, ok: boolean): void {
  const resolve = waiting.get(id);
  if (!resolve) return;
  waiting.delete(id);
  if (useConfirmStore.getState().request?.id === id) useConfirmStore.setState({ request: null });
  resolve(ok);
}
