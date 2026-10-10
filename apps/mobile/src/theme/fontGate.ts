/**
 * SH-02: the app may leave the splash once the fonts have loaded OR failed. On a failure
 * the phone's own font is used — a member is never stuck on the splash over a font.
 */
export function fontsSettled(loaded: boolean, error: Error | null | undefined): boolean {
  return loaded || error != null;
}
