/**
 * R-77 (owner, 22 Oct 2026): after joining, "automatically shows a pop-up to add the icon on the
 * screen ... we want the default app icon to be gone". Android never lets an app delete its own
 * icon or draw it from a downloaded logo (only icons built into the app can be swapped, and a hidden
 * icon can leave the app impossible to open). So: step 1 adds the gym's logo with Android's own
 * question (gymShortcut.ts); step 2 shows the member how to take the ForgeAI icon off the home
 * screen themselves — it stays in the app list, so the app can always be found. PURE, tested.
 * Member words: never "volume", "PR" or "session".
 */

export const GYM_ICON_WORDS = {
  addTitle: (gym: string) => `Put ${gym} on your home screen`,
  addBody: (gym: string) => `${gym}'s logo opens MettleUp in your gym's look.`,
  add: 'Add to home screen',
  notNow: 'Not now',
  confirmBody: "Tap Add on your phone's question. Then come back here.",
  checkAgain: 'I added it',
  notAddedTitle: 'Not added',
  notAddedBody: "Your gym's icon was not added. You can add it any time in Settings → Your gym.",
  removeTitle: 'Last step: remove the MettleUp icon',
  removeSteps: [
    'Go to your home screen.',
    'Press and hold the MettleUp icon.',
    'Tap Remove (on some phones: Remove from Home).',
  ],
  removeNote: "MettleUp stays on your phone, in your app list. Only its icon leaves the home screen. Don't tap Uninstall.",
  done: 'Done',
  close: 'Close',
} as const;

/** When the gym lets this phone go (the Gym tab disappears): the title of the notice. PURE. */
export const UNLINKED_TITLE = (gym: string): string => `No longer in ${gym}`;

