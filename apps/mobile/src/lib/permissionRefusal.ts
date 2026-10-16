/**
 * Is this failure just the member saying no to a permission? (16 Oct 2026)
 *
 * The phone test's Monkey run logged a refused camera as an error:
 *   "Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.
 *    → Caused by: User rejected permissions"
 * A refusal is a normal answer: the screen explains how to allow it and the log line is info,
 * never '[ForgeErr]'. Matches our own 'camera-denied' (the permission ask said no), the picker's
 * "rejected permissions", and the common "permission denied" / "missing permission" wordings,
 * also inside a wrapped error's `cause`. "has been rejected" alone is NOT a refusal: every native
 * call failure says that. PURE; never throws.
 */
const REFUSAL = /\brejected permissions?\b|\bpermissions? (?:was |were |is |are )?denied\b|\bmissing (?:\w+ )?permissions?\b/i;

export function isPermissionRefusal(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    if (typeof cur === 'string') return cur === 'camera-denied' || REFUSAL.test(cur);
    if (typeof cur !== 'object') return false;
    const { message, code, cause } = cur as { message?: unknown; code?: unknown; cause?: unknown };
    if (typeof message === 'string' && (message === 'camera-denied' || REFUSAL.test(message))) return true;
    if (typeof code === 'string' && /PERMISSION/i.test(code)) return true;
    cur = cause;
  }
  return false;
}
