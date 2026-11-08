/**
 * "What's new" after each update (owner backlog, Planned): the first time the app opens on a new
 * version, the Workout tab says in plain words what changed, once. "Got it" hides it until the next
 * version. The first version an install meets is only remembered, never announced: a fresh install
 * has nothing "new", and the cloud phone tests (fresh installs with sample workouts) must not see a
 * card that moves every screen. So the news shows from the NEXT update on.
 *
 * R-56 (owner, 22 Oct 2026): "let the user expand and see what changes in previous updates also...
 * may be up to 7 updates". The card's "See earlier updates" opens the 7 updates before this one
 * (`earlierUpdates`), and Settings → What's new keeps the whole list to read again after "Got it".
 *
 * Add a version's entry at the TOP of `WHATS_NEW_LOG` when it is released; a version with no lines
 * shows nothing. Only what a member can see or feel. Member words: never "volume", "PR" or "session".
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import type { GymSection } from '@/shop/gymTab';

import { isNewer } from './appUpdate';

/**
 * One change, in one short sentence a member understands with the app closed (owner R-98, 24 Oct 2026).
 * `go`, when the change has a place to try it: a button that opens that screen or setting at once.
 */
export interface WhatsNewLine {
  text: string;
  go?: { label: string; href: WhatsNewTab | `/settings/${string}`; section?: GymSection };
  /**
   * F198 (R-389/R-390, 7 Nov 2026): a NEW feature (never a fix) with a `go` place. Small dots then lead the
   * member to it from the tab, Settings and the row (lib/newDots.ts derives the trail from `go`), for 30 days
   * from the entry's date, until the member opens the page.
   */
  feature?: true;
}

/** The tabs a line's button can switch to (0.56.0: the new Progress tab too). */
export type WhatsNewTab = '/workout' | '/progress' | '/shop';
const TABS: readonly string[] = ['/workout', '/progress', '/shop'] satisfies readonly WhatsNewTab[];

/**
 * What a line's button does on this phone, or null for no button. PURE.
 * - The Gym tab ('/shop') is always there (Release A): without a gym it is the "Join your gym" screen,
 *   so the button says so.
 * - A button that would open the page it is on is left out (Settings → What's new).
 * - `tab` tells the caller to switch tabs (router.navigate) rather than stack a page (router.push).
 */
export function goFor(line: WhatsNewLine, inGym: boolean, here?: string): { label: string; href: string; tab: boolean } | null {
  if (!line.go) return null;
  const go = line.go.href === '/shop' && !inGym ? { label: 'Join your gym', href: '/shop' } : line.go;
  if (go.href === here) return null;
  return { label: go.label, href: go.href, tab: TABS.includes(go.href) };
}

export interface WhatsNewEntry {
  version: string;
  /** The day it was released, e.g. "22 Oct". */
  date: string;
  lines: readonly WhatsNewLine[];
}

/** Newest first. */
export const WHATS_NEW_LOG: readonly WhatsNewEntry[] = [
  {
    // Owner's release, 7 Nov 2026 ~23:3x IST ("Okay you can release next 2 features", R-400): F194 + R-398 + R-397.
    // member-words: Gemini timed out twice, so a fresh-reader helper checked the lines (clearer "add up", "dot").
    version: '0.75.0',
    date: '8 Nov',
    lines: [
      {
        text: 'In Settings, Plates and bars, pick 2.5 kg or 5 kg steps for machines and cables, so suggested weights match your gym.',
        go: { label: 'Machine and cable steps', href: '/settings/plates' },
        feature: true,
      },
      { text: 'Exercise charts now add up your total for the time you pick, for example all-time kg lifted.' },
      { text: "On an exercise chart, tap a dot, then tap its date to open that day's workout." },
    ],
  },
  {
    // Owner's release, 7 Nov 2026 15:2x IST ("first build the dot functionality and release it"). F198 only;
    // member-words + Gemini 3.8 Flash pass (location first).
    version: '0.74.0',
    date: '7 Nov',
    lines: [
      { text: 'New features now have a small dot. Start on the Profile tab and follow the dots to find them.' },
    ],
  },
  {
    // R-373 (owner's release, 5 Nov 2026 22:48 IST): member-words + Gemini 3.8 Flash pass; with Play's "• " each
    // line, 474 of 500 characters (R-313).
    version: '0.73.0',
    date: '6 Nov',
    lines: [
      { text: 'Suggested weights are simpler: 1 more rep on each set until all sets reach the top of your rep range, then more weight.' },
      { text: "Bodyweight exercises: the green line says when you beat last time's total reps." },
      { text: 'Turn on "Sleep and workouts" in Settings to see if you slept under 6 hours before a lighter workout.', go: { label: 'Sleep and workouts', href: '/settings/health' }, feature: true },
      { text: 'Watch: bigger -15 and +15 buttons on the rest timer, and long names fit.' },
      { text: '"Muscles ready today" and Quick workout are gone from the Workout tab.' },
      { text: 'Many small fixes.' },
    ],
  },
  {
    // R-372 (5 Nov): the two lines about "Muscles ready today" and Quick workout were dropped; both are switched off.
    // R-331 (owner's release, 5 Nov 08:24 IST, "Release all" 08:3x): member-words, short complete sentences, names as
    // the screens show them. Pay your gym (test mode) and pass members are left out: few members see them yet.
    // With Play's "• " each line, 486 of 500 characters (R-313).
    version: '0.72.0',
    date: '5 Nov',
    lines: [
      { text: 'Ask your own AI app about your workouts: open Settings, then "Ask an AI about your workouts".', go: { label: 'Ask an AI', href: '/settings/ask-ai' }, feature: true },
      { text: 'If you train at a gym, your share pictures can show its logo. In Progress photos, tap "Share before and after".' },
      { text: 'Tap "Invite a friend" on the Gym tab to send a friend a link to your gym.', go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' } },
    ],
  },
  {
    // R-315 (owner's release, 3 Nov 22:34 IST): member-words, short complete sentences; fresh-reader pass on the watch
    // words (R-312..R-314). Together these fit Play's 500 characters (R-313).
    version: '0.71.0',
    date: '4 Nov',
    lines: [
      { text: 'After a set on a machine or barbell, your phone shows "In use" and how many kg you need to beat your previous total.' },
      { text: 'Each set now gets its own rep goal. If you are stuck at a weight, the app asks before it suggests a lighter one.', go: { label: 'Workout choices', href: '/settings/workout-choices' } },
      { text: 'Suggested machine weights now follow the steps on the machine, like 35, 40 and 45 kg.' },
      { text: 'On the chart of an exercise, tap a point and then its label to open that workout.' },
      { text: 'On your watch, you can now log each set with the dial and one tap on Done.', go: { label: 'Your watch', href: '/settings/watch' } },
    ],
  },
  {
    // R-295: member-words; short complete sentences, no Gemini (owner rule 1 Nov). Server parts 0049-0051 live
    // 3 Nov (R-294). Trainer lines use the words he approved in #86; the busy-machines line follows #84.
    version: '0.70.0',
    date: '3 Nov',
    lines: [
      { text: 'Your gym can post a workout of the day. Find it on the Workout tab and start it with one tap.', go: { label: 'Open Workout', href: '/workout' } },
      { text: 'If your trainer filmed an exercise, tap "Watch your trainer" on that exercise\'s page.' },
      {
        // R-296: members who joined before 0.70.0 start with sharing off, so the line asks; it never says it is on.
        text: 'Want your trainer to follow your progress? Switch on "Share my workouts with my trainers".',
        go: { label: 'What my gym can see', href: '/settings/gym-sees' },
      },
      { text: 'If your gym shows busy machines, "What my gym can see" says what is shared, and you can switch it off.' },
    ],
  },
  {
    // R-282..R-289: member-words; short complete sentences, no Gemini (owner rule 1 Nov). Busy machines (F137)
    // stays hidden until its server part is switched on, and new members never see this list, so no line
    // for either it or the first-routine guide (F186). Facts checked against the code.
    version: '0.69.0',
    date: '3 Nov',
    lines: [
      { text: 'Your main lifts now show a strength level on the exercise page. Your body weight stays private.' },
      { text: 'Earn badges by training, like 50 workouts. Tap "Badges" on your Profile to see them all.' },
      { text: 'If a set felt easy, the next sets suggest a little more. Rest that runs over now shows in red.' },
      { text: 'Charts spots a muscle you train much less than the rest and offers one exercise swap for 8 weeks.' },
      { text: 'Settings is simpler, with one place for backup. The muscle map can show the last 30 or 90 days.' },
      { text: 'At gym check-in, the front desk confirms your mobile number once, so nobody else can use it.' },
    ],
  },
  {
    // R-281 (R-276..R-280): member-words; short lines, no Gemini (owner rule 1 Nov). The new welcome screen
    // is for new members only and help answers are not live until the AI credit lands, so no line for them.
    version: '0.68.0',
    date: '2 Nov',
    lines: [
      { text: 'Exercise pictures now use the MettleUp colours. The exercise list shows a close-up of each one.' },
      { text: 'Triceps Dip, Cable Lateral Raise, Walking Lunge and Plank now have pictures.' },
    ],
  },
  {
    // R-263 + R-267 + R-269 (0.66.0 was never published; it ships here): member-words; owner rule 1 Nov:
    // complete simple sentences, no Gemini for short lines. Facts checked against the code.
    version: '0.67.0',
    date: '1 Nov',
    lines: [
      {
        text: "Settings → Health Connect can now add weigh-ins from your smart scale to your body weight, and show today's steps.",
        go: { label: 'Open Health Connect', href: '/settings/health' },
      },
      { text: 'On your watch, the rest timer has bigger text, and "Workout saved" shows when you finish.' },
      { text: 'When you join a gym, you can scan the gym poster instead of typing the code. A wrong code is caught at once.' },
      { text: 'Is your gym not on MettleUp yet? Open the Gym tab and tap "Recommend MettleUp to my gym".' },
    ],
  },
  {
    // R-256/R-258/R-259, R-260, UK2: member-words, Gemini 3.8 Flash pass (took its "where" order on the logo
    // line and "touch and hold ... instead of leaving you on the Workout tab"); its "Later ... so it never
    // interrupts you" dropped (wrong cause). Facts checked.
    version: '0.65.0',
    date: '31 Oct',
    lines: [
      { text: 'The new MettleUp logo now shows when the app opens and at the top of the Workout, Progress and Gym tabs.' },
      { text: 'When a new version is ready, a pop-up tells you (never during a workout). "Later" asks again in 3 days.' },
      { text: 'Touch and hold the app icon and tap "Resume workout". It now opens your workout, not the Workout tab.' },
    ],
  },
  {
    // R-248: member-words, Gemini Flash pass (took "at the top of the screen"); facts checked. The intro
    // screens are for new members only, so no line.
    version: '0.64.0',
    date: '31 Oct',
    lines: [
      { text: 'Have a Wear OS watch? Start a workout and tap "Install on watch" at the top to see rest, next set and heart rate there.' },
    ],
  },
  {
    // R-234 / R-236: member-words, Gemini 3.6 Flash pass (line 6 took its "Progress
    // photos screen"); its invented "check your form" dropped. Facts checked.
    version: '0.63.0',
    date: '31 Oct',
    lines: [
      { text: 'Your watch now keeps MettleUp open all workout. It dims with your wrist down and lights up when you look.' },
      { text: 'During a workout, each exercise now shows your next set first, like "Next: 75 kg × 5".' },
      { text: 'In the exercises list, exercises without a drawing now show a photo of the start position.' },
      {
        text: 'On the Gym tab, "Leaderboard" is now called "Ranking", so it fits when you use big text.',
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
      { text: 'To join a gym, "Scan the poster" is now the first button on the Gym tab. You can still type the code.' },
      { text: 'On the Progress photos screen, if your phone blocks the camera, tap "Allow the camera in Settings" to turn it on.' },
    ],
  },
  {
    // R-228: member-words, fresh-reader pass on the scanner words; facts checked.
    version: '0.62.1',
    date: '30 Oct',
    lines: [
      {
        text: '"Check in" on the Gym tab now opens a scanner in MettleUp. Point it at the QR poster at your gym’s desk.',
        go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' },
      },
      { text: 'Fixed: MettleUp could close by itself when a message from your gym came in.' },
    ],
  },
  {
    // R-225 + R-224: member-words, fresh-reader pass (lines 2, 4, 5 and 6 took its wording), facts checked.
    version: '0.62.0',
    date: '30 Oct',
    lines: [
      {
        text: 'The Gym tab now has 3 parts at the top: "Shop" (only if your gym sells things), "My gym" and "Leaderboard".',
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
      {
        text: 'To pause or renew your membership, go to Gym, then "My gym", and tap "Pause my plan" or "Renew my plan".',
        go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' },
      },
      { text: 'If your gym wants to see your workout report, the app asks you first. Nothing is sent unless you say yes.' },
      { text: 'Many exercises now show a start and an end picture, so you can check your body position.' },
      { text: 'On an exercise page, tap "1-rep max and % calculator" to see the most you can lift once, and any % of it.' },
      { text: 'Voice feedback now has a second way to send. If you saw "Couldn\'t reach us" before, please try again.' },
    ],
  },
  {
    // R-206 + R-195: member-words, Gemini 3.8 Flash pass (line 1 took its "writes it as text"), facts checked.
    version: '0.61.0',
    date: '29 Oct',
    lines: [
      {
        text: 'In the feedback box, tap "Speak" and talk in Hindi or English. The app writes it as text you can fix before "Send".',
        go: { label: 'Feedback settings', href: '/settings/feedback' },
      },
      {
        text: 'Your gym\'s first 2 messages a day still pop up. Any more that day wait quietly in the Gym tab, so your phone stays calm.',
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
    ],
  },
  {
    // R-181: member-words, Gemini 3.8 Flash pass, facts checked. 6 lines max, so the finish-screen kg and
    // the History kg share a line; the watch app (testers only, Wear OS track) is left to its Play notes.
    version: '0.60.0',
    date: '29 Oct',
    lines: [
      {
        text: 'Tap the round button on any screen to tell us what is wrong or what you want, by speaking or typing.',
        go: { label: 'Feedback settings', href: '/settings/feedback' },
      },
      { text: 'After a workout, see the kg you lifted today next to last time. Each exercise\'s History shows kg per workout too.' },
      { text: 'Pull-ups, push-ups and other body-weight moves now show last time\'s numbers from any workout, in any routine.' },
      { text: 'On the Gym tab, see how busy your gym is right now and its quiet hours later today.', go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' } },
      {
        text: 'Tap a name on your gym\'s leaderboard to see the workouts that member shares. Sharing yours is off until you turn it on.',
        go: { label: 'Share my workouts', href: '/settings/gym-sees' },
      },
      { text: 'Lateral Raise and Incline Dumbbell Press now have a short moving demo on their exercise page, to check your form.' },
    ],
  },
  {
    version: '0.59.0',
    date: '28 Oct',
    lines: [
      {
        // R-153 (0.58.1 never reached members, so its line is merged here): FCM push + the 15-minute check.
        // member-words: Gemini pass, facts checked.
        text: 'Messages and offers from your gym now pop up on your phone right away, even when the app is closed.',
        go: { label: 'Notification settings', href: '/settings/notifications' },
      },
      { text: 'During a workout, the "kg to beat" and the PREVIOUS column now come from the same last workout, so the numbers match.' },
      { text: 'If a lighter first set hit the top of its reps last time, the app now suggests your main weight for it.' },
      { text: 'Match the "kg to beat" exactly and the app says "reached". It says "beaten" only when you lift more.' },
      { text: '"Resume workout" now opens at the exercise you were on, so you do not have to scroll.' },
    ],
  },
  {
    version: '0.58.0',
    date: '26 Oct',
    lines: [
      {
        // R-133: words checked by a fresh reader.
        text: 'Gym tab: a leaderboard of your gym for the last 30 days, by workouts or by kg lifted. See your place and the top 10.',
        go: { label: 'Open Gym', href: '/shop', section: 'board' },
      },
      { text: 'Reach the challenge goal shown in the Gym tab, then show that screen at the front desk for your reward.' },
      {
        text: 'Other members see your name only if you switch it on: Settings → Your gym → What my gym can see.',
      },
    ],
  },
  {
    version: '0.57.1',
    date: '25 Oct',
    lines: [
      {
        // R-132: words checked by a fresh reader (Gemini timed out).
        text: 'Progress tab: new tabs at the top, Kg lifted, Sets and Duration. Tap one to see your totals for it.',
        go: { label: 'Open Progress', href: '/progress' },
      },
      {
        text: "Progress also shows your next workout's total kg if you hit every target, next to last time's total.",
      },
      {
        // R-131.
        text: 'New phone? Tap "Continue with Google" on the first screen to find and restore your Google Drive backup.',
      },
    ],
  },
  {
    version: '0.57.0',
    date: '25 Oct',
    lines: [
      {
        // R-123: the backup file, for every member (with or without a gym).
        text: 'Settings → Back up and restore → "Save a backup": one file with your workouts, routines, photos and settings.',
        go: { label: 'Save a backup', href: '/settings/save-backup' },
      },
      {
        text: 'New phone, or back after a while? Tap "Restore from a backup" to bring it all back, even from the old ForgeAI app.',
        go: { label: 'Restore from a backup', href: '/settings/restore-backup' },
      },
      {
        text: "Gym members: measurements your trainer takes now show in Progress → Body, marked with your gym's name.",
        go: { label: 'Open Progress', href: '/progress' },
      },
      {
        text: 'Your trainer can now send you a diet plan. Once sent, tap "Diet plan" in the Gym tab to see your meals.',
        go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' },
      },
      {
        // R-124: shows once the gym adds its timings in the admin app.
        text: 'The Gym tab now shows if your gym is open right now, with its hours for the week and any holiday.',
        go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' },
      },
    ],
  },
  {
    version: '0.56.1',
    date: '25 Oct',
    lines: [
      {
        // Google Play policy: the app can no longer turn this on by itself; the member allows it once.
        text: 'When MettleUp asks, turn on "Alarms & reminders" so "Rest is over" rings on time, even on a locked phone.',
        go: { label: 'Open Rest timer and sounds', href: '/settings/rest' },
      },
    ],
  },
  {
    version: '0.56.0',
    date: '24 Oct',
    lines: [
      { text: 'ForgeAI is now called MettleUp, with a new orange logo. Same app: your workouts and history are all still here.' },
      { text: 'At the bottom of the screen, the same 4 tabs always show: Workout, Progress, Gym and Profile. They never move.' },
      {
        text: 'Your charts, records and body weight are now together in the new Progress tab.',
        go: { label: 'Open Progress', href: '/progress' },
      },
      {
        text: 'In the Gym tab, join your gym, or check in at the front desk by scanning the poster with your camera.',
        go: { label: 'Open the Gym tab', href: '/shop', section: 'gym' },
      },
      {
        text: 'Settings is now in clear groups. Rest timer options and sounds have their own page, "Rest timer and sounds".',
        go: { label: 'Open Rest timer and sounds', href: '/settings/rest' },
      },
      {
        text: "Health Connect (Google's health app) now stays on. Your workouts are sent even if you don't allow calories there.",
        go: { label: 'Health Connect settings', href: '/settings/health' },
      },
    ],
  },
  {
    version: '0.55.1',
    date: '24 Oct',
    lines: [
      {
        text: '"What\'s new" is now easier to read, and a button under a change takes you straight to it.',
        go: { label: "See what's new", href: '/settings/news' },
      },
      { text: 'Settings → "What\'s new" shows your last 3 updates.' },
    ],
  },
  {
    version: '0.55.0',
    date: '23 Oct',
    lines: [
      {
        text: 'Gym members: your gym can reward you for training. Hit its target days and get free days on your membership.',
        go: { label: "See your gym's offer", href: '/shop', section: 'gym' },
      },
      { text: 'Only the dates of the workouts that count leave your phone, and only after you tap Join. Leave the offer any time.' },
    ],
  },
  {
    version: '0.54.1',
    date: '22 Oct',
    lines: [{ text: 'Scrolling a workout is easier. A swipe that starts on a weight or reps box now scrolls the page.' }],
  },
  {
    version: '0.54.0',
    date: '22 Oct',
    lines: [
      {
        text: "Joined a gym that has its own look? The app changes to your gym's name and colours.",
        go: { label: 'Open the Gym tab', href: '/shop' },
      },
      { text: 'After you join, a "Gym" button appears at the bottom.' },
      { text: 'To leave your gym, open Settings, then "Your gym".', go: { label: 'Open Your gym', href: '/settings/gym' } },
    ],
  },
  {
    version: '0.53.0',
    date: '22 Oct',
    lines: [
      { text: 'After a workout, see if you beat your last time on the same routine. Tap the result to see each exercise.' },
      {
        text: "Haven't trained a muscle in 3 weeks? The Workout tab may suggest a few sets for it.",
        go: { label: 'Turn tips on or off', href: '/settings/muscle-tips' },
      },
      {
        text: 'Gym members: show your workout days to the front desk on your screen, from "My membership".',
        go: { label: 'Open My membership', href: '/shop', section: 'gym' },
      },
    ],
  },
  {
    version: '0.52.0',
    date: '22 Oct',
    lines: [
      { text: 'Each exercise shows how many kilos you still need to beat last time. It turns green when you do.' },
      {
        text: "Last time's numbers now come from the last time you did that exercise, in any routine.",
        go: { label: 'Change setting', href: '/settings/last-time' },
      },
      { text: 'Warm-up sets stay as they were last time. The app never changes them.' },
      { text: 'Push-ups, pull-ups and other bodyweight moves now show how many reps beat last time.' },
      {
        text: 'Turn on a big "In use" screen after each set, so others know the machine is taken.',
        go: { label: 'Turn it on', href: '/settings/rest' },
      },
      {
        text: "The app now asks before sending past workouts to Health Connect (Google's health app).",
        go: { label: 'Open settings', href: '/settings/health' },
      },
    ],
  },
  {
    version: '0.51.0',
    date: '22 Oct',
    lines: [
      { text: "During a workout, your phone's notifications show how long you've been training." },
      {
        text: 'Pick the sound that plays when your rest is over: chime, bell, double beep or whistle.',
        go: { label: 'Pick a sound', href: '/settings/rest' },
      },
    ],
  },
  {
    version: '0.50.0',
    date: '22 Oct',
    lines: [
      { text: 'Did a workout without a routine? Save it as a routine in one tap when you finish.' },
      { text: 'Resting? Tap the rest timer to show a big "In use" screen, so others know the machine is taken.' },
      { text: "Change an exercise's rest time while you rest, and the running timer changes too." },
      // Not "Your workouts back up to Drive by themselves": Drive backup is hidden until the
      // owner's Google setup (Project Tracker #42), so no member can link it yet.
    ],
  },
  {
    version: '0.49.0',
    date: '21 Oct',
    lines: [
      { text: 'The Workout tab now tells you when a new version of MettleUp is ready.' },
      { text: 'Tell us what to fix or add, by typing or speaking.', go: { label: 'Send feedback', href: '/settings/feedback' } },
      { text: 'Joining a gym now asks you to confirm you are 18 or older and agree to the terms.' },
      { text: 'MettleUp no longer asks to use your microphone.' },
    ],
  },
  {
    version: '0.48.0',
    date: '18 Oct',
    lines: [
      { text: "Your trainer's workout plans now appear on your Workout tab by themselves." },
      { text: 'In a routine, each exercise shows the kilos to beat, and each set shows what to aim for.' },
      {
        text: 'New "My membership" page: your plan, end date, days left and visits this month.',
        go: { label: 'Open My membership', href: '/shop', section: 'gym' },
      },
      { text: "Scan the QR code at your gym's desk, then start today's workout in one tap." },
      { text: "Got a code from your gym? Join from the first screen and add your gym's logo to your home screen." },
    ],
  },
  {
    version: '0.47.1',
    date: '18 Oct',
    lines: [
      { text: 'After you rate how hard a set felt, the tick shows once and keeps the numbers you typed.' },
      { text: 'Switching gyms while a shop order is waiting now asks you first, because switching cancels it.' },
    ],
  },
  {
    version: '0.47.0',
    date: '17 Oct',
    lines: [
      { text: 'Join your gym with its code.', go: { label: 'Open the Gym tab', href: '/shop' } },
      { text: 'Rate how hard a set felt, and the set ticks itself before your rest starts.' },
      { text: 'A small handle shows which exercises and routines you can drag to move.' },
      { text: 'Fixes for large text sizes, and for the keyboard after opening the app from its home-screen shortcut.' },
    ],
  },
  {
    version: '0.46.0',
    date: '16 Oct',
    lines: [
      { text: 'New: the MettleUp watch app. Your rest counts down and buzzes on your Wear OS watch.' },
      { text: "Said no to the camera? The app now tells you and opens your phone's Settings to allow it." },
      { text: 'Many small fixes from a full check of the app.' },
    ],
  },
  {
    version: '0.45.0',
    date: '16 Oct',
    lines: [
      {
        text: 'The rep range you set in Settings now shows when you edit a routine.',
        go: { label: 'Choose your reps', href: '/settings/next-weight' },
      },
      { text: 'A new app icon that fits round home screens.' },
    ],
  },
  {
    version: '0.44.0',
    date: '15 Oct',
    lines: [
      { text: 'Rate how hard a set felt with one tap, and your rest timer starts.' },
      { text: 'The "Rest is over" sound is now the same with the screen off as with the app open.' },
      { text: 'A new record pops up with confetti and names the record you beat.' },
      { text: 'During a workout, hold and drag an exercise to move it.' },
      {
        text: 'Choose how big each suggested weight increase is: "Weight jumps".',
        go: { label: 'Choose your weight step', href: '/settings/next-weight' },
      },
    ],
  },
];

/** A version's lines, for the card's top (kept by name for the tests and older callers). */
export const WHATS_NEW: Readonly<Record<string, readonly WhatsNewLine[]>> = Object.fromEntries(
  WHATS_NEW_LOG.map((e) => [e.version, e.lines]),
);

/** R-98 (owner, 24 Oct 2026): "the last three updates": this one and the 2 before it. */
export const SHOWN_UPDATES = 3;
/** How many earlier updates the card opens (with this one: the last 3). */
export const EARLIER_MAX = SHOWN_UPDATES - 1;

/** The updates before `current`, newest first, at most `max`. PURE. */
export function earlierUpdates(current: string | null | undefined, max = EARLIER_MAX): readonly WhatsNewEntry[] {
  if (!current) return [];
  return WHATS_NEW_LOG.filter((e) => isNewer(current, e.version) && e.lines.length > 0).slice(0, max);
}

/** Settings → What's new: the last 3 updates up to this version, newest first. PURE. */
export function updatesUpTo(current: string | null | undefined, max = SHOWN_UPDATES): readonly WhatsNewEntry[] {
  const upTo = current ? WHATS_NEW_LOG.filter((e) => !isNewer(e.version, current)) : WHATS_NEW_LOG;
  return upTo.filter((e) => e.lines.length > 0).slice(0, max);
}

const SEEN_KEY = 'whats_new_seen'; // the last version whose news was shown (or skipped)
/** R-401: the version whose lines the update full screen (UpdatePrompt.tsx) already showed. */
const PREVIEWED_KEY = 'whats_new_previewed';

/** The lines to show, or null. PURE. */
export function whatsNewToShow(
  current: string | null | undefined,
  seen: string | null,
  previewed: string | null = null,
): readonly WhatsNewLine[] | null {
  // R-401 (owner, 8 Nov 2026): the update full screen already showed this version's lines: not twice.
  if (!current || seen == null || seen === current || previewed === current) return null;
  const lines = WHATS_NEW[current];
  return lines && lines.length > 0 ? lines : null;
}

/** What the card shows now. A version with nothing to show is remembered at once. Never throws. */
export async function readWhatsNew(current: string | null | undefined): Promise<readonly WhatsNewLine[] | null> {
  if (!current) return null;
  try {
    const seen = await getMeta(SEEN_KEY);
    const lines = whatsNewToShow(current, seen, await getMeta(PREVIEWED_KEY));
    if (!lines && seen !== current) await enqueueWrite(() => setMeta(SEEN_KEY, current));
    return lines;
  } catch (e) {
    console.warn('[whats new] could not read', e);
    return null;
  }
}

/**
 * Release A hints (lib/layoutHints.ts): did this install meet an EARLIER version than current? A
 * fresh install has no remembered version yet (or only this one), an update still holds the old one
 * until its What's new is closed. Never throws (unknown = no).
 */
export async function installMetEarlierVersion(current: string | null | undefined): Promise<boolean> {
  if (!current) return false;
  try {
    const seen = await getMeta(SEEN_KEY);
    return seen != null && seen !== current;
  } catch (e) {
    console.warn('[whats new] could not read the last version', e);
    return false;
  }
}

export async function markWhatsNewSeen(current: string): Promise<void> {
  await enqueueWrite(() => setMeta(SEEN_KEY, current));
}

/** R-401 UAT, QA builds only (mettleup://qa-update?oldnews=1): as if this phone came from an older version. */
export async function qaForgetWhatsNew(): Promise<void> {
  await enqueueWrite(async () => {
    await setMeta(SEEN_KEY, '0.0.1');
    await setMeta(PREVIEWED_KEY, '');
  });
}

/** R-401: the update full screen showed `version`'s lines; after that update the card stays away. */
export async function markWhatsNewPreviewed(version: string): Promise<void> {
  await enqueueWrite(() => setMeta(PREVIEWED_KEY, version));
}
