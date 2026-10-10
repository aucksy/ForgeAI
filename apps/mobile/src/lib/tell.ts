/**
 * Audit Phase 7 (packet B): tell the member something in the app's own sheet — never Android's
 * grey one-button pop-up (`Alert.alert`). "Could not save — please try again", "Nothing to
 * save". Needs `<ConfirmHost />` at the app root (it is). Resolves when the sheet is closed.
 */
import { askConfirm } from '@/components/ui/confirmStore';

/** The one button on a notice: it names what it does (never "OK"). */
export const NOTICE_BUTTON = 'Close';

export function tell(title: string, body?: string): Promise<void> {
  return askConfirm({ title, body, confirmLabel: NOTICE_BUTTON, notice: true }).then(() => undefined);
}
