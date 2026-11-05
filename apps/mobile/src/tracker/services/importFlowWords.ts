/**
 * R-319 item 4 (owner, 4 Nov 2026: "see if this experience can be a bit better and intuitive"):
 * the words of the ONE "bring your workouts in" flow. Settings → "Bring in from Hevy or Strong"
 * asks which app; the import screen shows that app's export steps, reads the file, imports it,
 * then offers the routines in the same flow. Neither app's export file holds saved routines (Strong
 * has no routine export at all; Hevy's file is workouts only), so routines are rebuilt from the
 * workouts the member repeats most (`routineRebuild.ts`), and the words say so plainly. A Hevy
 * share link (routines exactly as saved) is a second way, inside the Hevy branch only. PURE.
 */
export type SourceApp = 'hevy' | 'strong';

export const IMPORT_FLOW_WORDS = {
  heading: 'Bring in your workouts from another app',
  question: 'Which app are you moving from?',
  hevy: 'Hevy',
  strong: 'Strong',
  // Fresh-eyes review (5 Nov 2026): the two rows had one subtitle; each now says what it brings.
  hevySub: 'Your workout file, or a link to a shared routine.',
  strongSub: 'Your workout file. We build your routines from it.',
  privacy: 'Your file is read on your phone. Nothing is uploaded.',
  linkTitle: 'Have a Hevy routine link?',
  linkBody: 'If you or a friend shared a Hevy routine or folder, paste its link. The routines come in exactly as saved.',
  linkButton: 'Paste a Hevy link',
} as const;

/** The numbered steps to get the export file out of the other app. */
export function exportSteps(app: SourceApp): string[] {
  if (app === 'strong') {
    return [
      'Open Strong and go to Settings → Export Strong Data.',
      'Save the .csv file to your phone.',
      'Come back here and tap “Choose Strong file”.',
    ];
  }
  return [
    'Open Hevy and go to Settings → Export & Backup Data.',
    'Export your workouts and save the .csv file to your phone.',
    'Come back here and tap “Choose Hevy file”.',
  ];
}

/** What happens to routines, said before the file is picked. */
export function routinesAheadText(app: SourceApp): string {
  return app === 'strong'
    ? 'Strong doesn’t export saved routines. After your workouts come in, we build your routines from the workouts you repeat most.'
    : 'After your workouts come in, we build your routines from the workouts you repeat most.';
}

/** After the import: the routines offer, in the same flow. `n` = routines found (at least 1). */
export function routinesOfferText(app: SourceApp, n: number): string {
  // Fresh-eyes review (5 Nov 2026): one routine reads in the singular ("Tick it if you want it").
  const built = `We built ${n} routine${n === 1 ? '' : 's'} from the workouts you repeat most. ${n === 1 ? 'Tick it if you want it.' : 'Tick the ones you want.'}`;
  return app === 'strong' ? `Strong doesn’t export saved routines. ${built}` : `Hevy’s file has your workouts but not your saved routines. ${built}`;
}
