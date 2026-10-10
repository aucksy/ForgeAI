/**
 * SH-29: a wrong forgeai:// link lands on Home with one calm line. The not-found route
 * leaves the note here; Home takes it (once) when it next comes into view.
 */
export const BAD_LINK_TEXT = "That link didn't work.";

let pending: string | null = null;

export function leaveLinkNotice(text: string = BAD_LINK_TEXT): void {
  pending = text;
}

/** Returns the waiting note and clears it, so it shows once. */
export function takeLinkNotice(): string | null {
  const t = pending;
  pending = null;
  return t;
}
