import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const D = '2026-11-20', S = 'server', A = 'server/database-2';
const P = 'supabase/migrations/';
const f = (n, o) => ({ kind: 'finding', id: `FN-L4-server-database-2-0${n}`, date: D, lens: '4', surface: S, area: A, ...o, proof: 'code-read', verified: 'pending', status: 'open' });
const rows = [
  f(1, {
    refs: ['E-gym-member-days', 'E-gym-exercise-starts', 'E-gym-progress-summaries', 'E-trainer-questions', 'E-gym-report-requests', 'E-gym-mate-profiles'], severity: 'S2',
    title: 'The time limits the privacy notice gives for gym-shared data only run when someone opens that screen',
    what: "The notice promises that leaderboard numbers go after 62 days, machine use after 63, workouts shared with gym mates after 60, the trainer summary after 90 days without an update, questions to a trainer after 180 days, and a sent workout report after 30. No timed job does any of this. Each clean-up runs only for one gym, and only when a member or staff person of that gym opens the matching screen. In a gym that stops using a feature, or stops using MettleUp, the data stays with no end. Machine use is also skipped while the gym is paused. Leaving the gym still deletes a member's rows at once, so this hits members who stay.",
    expected: 'Every time limit in the notice is kept by a nightly clean-up across all gyms, whether or not anyone opens a screen.',
    evidence: [P + '0037_leaderboard.sql:183-198', P + '0040_gym_mate_profiles.sql:89-97', P + '0049_busy_by_exercise.sql:200-208', P + '0050_trainer_view.sql:251-252', P + '0053_ask_trainer_and_progress.sql:291', P + '0053_ask_trainer_and_progress.sql:323', P + '0045_report_requests.sql:128-136', 'apps/dashboard/public/privacy.html:177-183'],
    root_cause_key: 'retention-runs-only-on-screen-open', who: 'members of gyms that stop using a feature or MettleUp', how_often: 'every gym where nobody opens that screen for a while',
    fix_line: 'Add one nightly clean-up that applies every stated time limit to all gyms.', fix_size: 'small', needs_him: false,
  }),
  f(2, {
    refs: ['F-server-432'], severity: 'S3',
    title: 'Numbers that started a free trial are kept in plain form for ever, even after the gym is deleted',
    what: 'When a gym is created with a WhatsApp-checked number, the number is saved in a list of numbers that already had a free trial. It is saved as the plain number, has no clean-up, and stays when the gym is deleted (only the link to the gym is cleared). The notice says WhatsApp number checks are kept for 2 days and that only a coded form of the number is kept. This part is not switched on live yet.',
    expected: 'The trial list keeps only a coded form of the number, and the notice states how long it is kept and why.',
    evidence: [P + '0061_phone_codes.sql:61-66', P + '0061_phone_codes.sql:169-180', 'apps/dashboard/public/privacy.html:137', 'apps/dashboard/public/privacy.html:189'],
    root_cause_key: 'trial-numbers-kept-plain-forever', who: 'gym owners who start a gym with a checked number', how_often: 'every gym made that way, once switched on',
    fix_line: 'Store a coded form of the number and add the trial list, with its time, to the notice.', fix_size: 'small', needs_him: true,
  }),
  f(3, {
    refs: ['E-gym-member-photos', 'E-gym-body-measurements', 'F-server-412', 'F-server-402'], severity: 'S2',
    title: "Deleting a member from the gym's list leaves their photo and body measurements behind, out of sight",
    what: "The desk photo and the body measurements are saved under the member's id on the gym's list. When the gym deletes that member from its list, nothing removes them. The screens only open a listed member, so the gym no longer sees that they are still there. Only a whole gym delete removes them. The face photo and the body figures stay with no end date.",
    expected: "Deleting a member from the gym's list also deletes their photo and measurements, or the gym is told what is kept and can remove it.",
    evidence: [P + '0043_member_photos.sql:39-48', P + '0043_member_photos.sql:105-115', P + '0035_trainer_measurements_diet.sql:33-50', P + '0035_trainer_measurements_diet.sql:239-246'],
    root_cause_key: 'member-delete-keeps-photo-measurements', who: 'members a gym deletes from its list', how_often: 'every member deleted who had a photo or measurements',
    fix_line: 'When a member is deleted from the list, delete their photo and measurements too.', fix_size: 'small', needs_him: false,
  }),
  f(4, {
    refs: ['F-server-427', 'F-server-428', 'E-entry-machine-punches', 'E-entry-machine-members'], severity: 'S3',
    title: 'Door entry machines are not in the privacy notice, and every door punch is kept for ever',
    what: 'The door machine part (fingerprint, face or card machines at the gym door) records every punch with the member, the time and how they were checked, and keeps each one with no end date. The privacy notice describes check-ins only as scanning the QR poster and never mentions door machines or how long punches are kept. This part is not switched on live yet.',
    expected: 'Before door machines go live, the notice names them, says what each punch records and how long it is kept, and old punches are cleaned up.',
    evidence: [P + '0058_entry_machines.sql:5-22', P + '0058_entry_machines.sql:80-94', 'apps/dashboard/public/privacy.html:89'],
    root_cause_key: 'door-punches-not-in-notice', who: 'members of gyms that add a door machine', how_often: 'every punch, once switched on',
    fix_line: 'Add door machines to the notice and give punches a clean-up time.', fix_size: 'small', needs_him: true,
  }),
  f(5, {
    refs: ['F-server-429', 'E-mettleup-payments'], severity: 'S3',
    title: 'Records of what a gym paid MettleUp are erased when the gym is deleted, though the notice says they are kept as tax law needs',
    what: "The notice says payments to MettleUp are kept as long as tax law requires. The new payment list and the payment record both go automatically the moment the gym is deleted, so a gym that leaves takes MettleUp's own proof of income with it. This part is not switched on live yet.",
    expected: "Payment records to MettleUp outlive the gym for the time tax law requires, with the gym's other data removed.",
    evidence: [P + '0060_pay_mettleup.sql:78-81', P + '0060_pay_mettleup.sql:236-238', 'apps/dashboard/public/privacy.html:194'],
    root_cause_key: 'tax-records-deleted-with-gym', who: 'MettleUp, at a tax check', how_often: 'every gym delete after paying',
    fix_line: 'Keep the payment records when a gym is deleted, without the link to the deleted gym.', fix_size: 'small', needs_him: false,
  }),
];
const grid = {
  kind: 'grid', surface: S, area: A, lens: '4', checked_on: D, items: [
    { item: 'L4.1', status: 'does-not-apply', reason: 'The item list gives 0 promises for this area.', evidence: [], finding_ids: [] },
    { item: 'L4.2', status: 'checked', reason: "Deletion and purpose duties checked against the notice: deleted members leave photo and measurements (03); trial numbers kept plain with no end (02); door machines missing from the notice (04); tax records erased with the gym (05). Under-18: nothing here checks age; app members tick 18+ at join, gym records are the gym's. Breach timing and consent screens are not in these files.", evidence: [P + '0043_member_photos.sql:39-48', P + '0061_phone_codes.sql:61-66', P + '0058_entry_machines.sql:5-22', P + '0060_pay_mettleup.sql:78-81'], finding_ids: ['FN-L4-server-database-2-02', 'FN-L4-server-database-2-03', 'FN-L4-server-database-2-04', 'FN-L4-server-database-2-05'] },
    { item: 'L4.3', status: 'checked', reason: 'MettleUp functions here are service-role only and guarded: owner sign-in reset, pop-up sender, payment checks (each writes an HQ log row) and the nightly backup (one HQ log row a night). The backup copies every table with personal data to the HQ Worker for 7 days, as the notice says. No person reads rows through these; no new finding.', evidence: [P + '0034_signin_pin.sql:341-358', P + '0052_hq_backup.sql:34-72', P + '0060_pay_mettleup.sql:34', P + '0054_member_alerts.sql:180-226'], finding_ids: [] },
    { item: 'L4.4', status: 'checked', reason: "Clean-ups that match the notice exist for push codes (60 days), pop-up notes (30 days), sign-in fails and check-in tries; but the gym-shared time limits only run on a screen open (01). Kept with no end: trial numbers (02), deleted members' photo and measurements (03), door punches (04), pending number requests (reused finding).", evidence: [P + '0038_member_push.sql:165-166', P + '0054_member_alerts.sql:191-193', P + '0037_leaderboard.sql:183-198', P + '0053_ask_trainer_and_progress.sql:291'], finding_ids: ['FN-L4-server-database-2-01', 'FN-L4-server-database-2-02', 'FN-L4-server-database-2-03', 'FN-L4-server-database-2-04', 'FN-A5-server-database-1-2-01'] },
    { item: 'L4.5', status: 'checked', reason: "Outside sends from this area: pop-ups through Google Firebase carry the gym name and fixed short notes or the gym message, as the notice says; WhatsApp number checks only accept a signed proof (Meta is named); online pay tells the web server the member's first name and list id, and the notice names the payment companies. No AI, analytics, Health Connect, Google Health or Fitbit here. No finding.", evidence: [P + '0054_member_alerts.sql:82-160', P + '0054_member_alerts.sql:216-218', P + '0061_phone_codes.sql:7-13', P + '0057_member_pay_me.sql:5-15', 'apps/dashboard/public/privacy.html:94', 'apps/dashboard/public/privacy.html:162-165'], finding_ids: [] },
    { item: 'L4.6', status: 'checked', reason: "Every member table here goes when the gym is deleted, and leaving the gym deletes leaderboard, machine use, trainer summary, questions, gym-mate data and push codes by trigger, and blanks the phone on challenge results. Gaps: a member deleted from the gym's list keeps photo and measurements (03); a pending number request keeps the number after leaving (reused). Backups expire in 7 days per the notice. A real delete was not run (live write).", evidence: [P + '0037_leaderboard.sql:200-217', P + '0038_member_push.sql:103-108', P + '0049_busy_by_exercise.sql:302-307', P + '0050_trainer_view.sql:219-224', P + '0053_ask_trainer_and_progress.sql:237-242', P + '0040_gym_mate_profiles.sql:99-108', P + '0052_hq_backup.sql:4-6'], finding_ids: ['FN-L4-server-database-2-03', 'FN-A5-server-database-1-2-01'] },
  ],
};
fs.writeFileSync(path.join(here, '..', 'out', 'L4-server-database-2.jsonl'), [...rows, grid].map(r => JSON.stringify(r)).join('\n') + '\n');
