/**
 * R-123 (owner, 25 Oct 2026: "Everything that I have changed should backup right"): the ONE list of
 * what a backup leaves out, each with its reason. Everything the app keeps on the phone is either
 * carried by the backup (backupFormat.ts SETTINGS_KEYS, backupCollect.ts, the packed records) or
 * named here. test/backup/backupCoverage.test.ts reads the app's source for every `meta` key,
 * AsyncStorage key, saved store, key-value and SecureStore key and table, and fails on one that is
 * in neither list — so a new setting can't be added and forgotten by the backup.
 */

/** `meta` table keys a backup carries (besides SETTINGS_KEYS.meta). */
export const META_IN_BACKUP: readonly string[] = ['hidden_exercises', 'importOriginalStarts', 'import_clock_real_v1', 'routine_import_marks'];

/** `meta` keys left out, and why. */
export const META_LEFT_OUT: Readonly<Record<string, string>> = {
  demo_data: 'demo flag',
  demo_until: 'demo flag',
  demo_legacy_checked: 'demo flag',
  seeded: 'demo flag (the sample data was loaded)',
  cloud_copy_owner: 'gym sign-in: who this phone copies for',
  cloud_copy_merge_pending: 'gym sign-in: cloud copy bookkeeping',
  cloud_copy_needs_sign_in: 'gym sign-in: cloud copy bookkeeping',
  cloud_copy_schema_version: 'database version',
  cloud_copy_last_at: 'gym sign-in: cloud copy bookkeeping',
  cloud_copy_full: 'gym sign-in: cloud copy bookkeeping',
  member_account: 'gym sign-in of this phone',
  cloud_identity: 'gym membership key of this phone',
  cloud_client_version: 'gym server bookkeeping',
  drive_linked: 'Google Drive link of this phone',
  drive_last_backup_at: 'Google Drive bookkeeping of this phone',
  schema_version: 'database version',
  member_schema_version: 'database version',
  tracker_schema_version: 'database version',
  exercise_catalog_version: 'library version (each phone has its own)',
  first_run_at: 'when the app first ran on this phone',
  update_seen: 'app update prompt (seen flag)',
  update_later: 'app update prompt ("Later" pressed)',
  feedback_sender: 'this phone\'s anonymous feedback id',
  whats_new_seen: 'one-off "seen" flag',
  notice_rest_day: 'one-off notice',
  redesign_tabs_notice: 'one-off "it moved" hint',
  activeWorkoutDraft: 'a workout in progress (a restore waits until it is finished)',
  phoneReminderSchedule: 'notification schedule of this phone (rebuilt from the reminder settings)',
  link_guessed_exercise_types: 'import bookkeeping (row ids of this phone)',
  hevy_timed_backfill_done: 'one-time repair mark',
  link_folder_repair_v1: 'one-time repair mark (runs again after a restore)',
  pr_single_e1rm_fix: 'one-time repair mark (runs again after a restore)',
  pr_long_set_e1rm_fix: 'one-time repair mark (runs again after a restore)',
  pr_lighter_set_e1rm_fix: 'one-time repair mark (runs again after a restore)',
  photo_backup_memo: 'cache of the photo copies made for Android\'s backup',
};

/** AsyncStorage / saved-store / key-value / SecureStore keys left out, and why. */
export const STORAGE_LEFT_OUT: Readonly<Record<string, string>> = {
  'forgeai.openai_api_key': 'AI key (never leaves the phone)',
  'forgeai.anthropic_api_key': 'AI key (never leaves the phone)',
  'forgeai.groq_api_key': 'AI key (never leaves the phone)',
  'forgeai.pendingPick': 'a photo pick in progress',
  'forgeai-free-limits': 'gym server flag',
  'forgeai-shop': 'gym shop cart',
  'forgeai-gym-shop': 'gym membership link',
  'forgeai-gym-inbox': 'gym messages (from the gym\'s server)',
  'forgeai-pending-link': 'gym invite in progress',
  'forgeai-gym-join-try': 'gym join in progress',
  'forgeai-gym-shortcut-offered': 'one-off "add the gym logo" offer',
  'forgeai-membership': 'gym membership',
  'forgeai-gym-plans-known': 'gym plans bookkeeping (from the gym\'s server)',
  'forgeai-gym-measures': 'gym trainer\'s measurements (from the gym\'s server)',
  'forgeai-gym-diets': 'gym diet plans (from the gym\'s server)',
  'forgeai-gym-reminders': 'gym reminders (from the gym\'s server)',
  'forgeai-gym-reminders-sent': 'gym reminders bookkeeping',
  'forgeai-gym-reminders-stamp': 'gym reminders bookkeeping',
  'forgeai-gym-reminders-joined': 'gym reminders bookkeeping',
  'forgeai-gym-notice-alerts': 'which gym notices already popped up on this phone (bookkeeping)',
  'forgeai-gym-leave-pending': 'gym leave in progress',
  'forgeai-gym-theme': 'the gym\'s branding (the gym sets it)',
  'forgeai-widget-token': 'home-screen widget key of this phone',
  'forgeai-gym-hours': 'gym opening hours (from the gym\'s server)',
};

/** Files that read or write a key worked out at run time, and what those keys are. */
export const DYNAMIC_KEYS: Readonly<Record<string, string>> = {
  'meta:db/index.ts': 'the database version',
  'meta:lib/appUpdate.ts': 'app update prompt flags',
  'meta:lib/layoutHints.ts': 'one-off layout hints',
  'meta:onboarding/db/importSafety.ts': 'demo flags (DEMO_META_KEYS)',
  'storage:onboarding/eraseDevice.ts': 'Erase all data removing every key',
  'storage:shop/gymActions.ts': 'gym offer bookkeeping (shop/offer.ts)',
  'storage:shop/gymReminders.ts': 'gym reminders bookkeeping',
  'storage:shop/offerActions.ts': 'gym offer bookkeeping (shop/offer.ts)',
};

/** Fields of a carried store that stay on the phone, and why. */
export const FIELDS_LEFT_OUT: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'forgeai-settings': { ai: 'AI coach (hidden in this build; its provider needs keys that never leave the phone)' },
  'forgeai-rest-alert-prefs': {
    exactAsked: 'the "Alarms & reminders" ask of this phone',
    exactAskedAt: 'the "Alarms & reminders" ask of this phone',
    exactAnswer: 'the "Alarms & reminders" ask of this phone',
    alertsHintFor: 'not saved (one workout\'s hint)',
  },
  'forgeai-phone-prefs': {
    healthUnsent: 'workouts this phone could not send to Health Connect',
    healthLast: 'when this phone last sent to Health Connect',
    showNameOnBoard: 'a privacy choice made per gym; asked again after a restore',
    boardNamePending: 'bookkeeping: the gym has not been told the name switch yet (this phone only)',
  },
  'forgeai-muscle-tips': {
    snoozedUntil: 'a tip snoozed for a few days',
    notNow: 'a tip put off for now',
    shown: 'the tip on screen now',
  },
  'forgeai-plate-setup': { loadError: 'not saved (a read problem shown on screen)' },
};

/** Tables: what carries each, or why it is left out. */
export const TABLES_IN_BACKUP: Readonly<Record<string, string>> = {
  user_profile: "'u' (never the phone number) and the profile photo",
  exercises: "'x' own exercises, libraryEdits, hiddenExercises, exercise pictures",
  exercise_prefs: "'p'",
  workout_plans: "'r'",
  plan_days: "'r'",
  plan_exercises: "'r'",
  workout_sessions: "'w'",
  set_entries: "'w'",
  body_weight: "'b'",
  body_measurements: "'m'",
  progress_photos: 'photos (with the pictures)',
  workout_photos: 'photos (with the pictures)',
  meals: 'rows',
  chat_messages: 'rows',
};

export const TABLES_LEFT_OUT: Readonly<Record<string, string>> = {
  personal_records: 'worked out again from the sets after a restore',
  meta: 'its keys are listed one by one (META_IN_BACKUP, META_LEFT_OUT)',
  sync_outbox: 'gym server queue of this phone',
  cloud_copy_state: 'cloud copy bookkeeping of this phone',
  cloud_copy_queue: 'cloud copy queue of this phone',
  training_changes: 'a change counter SQLite keeps (cache)',
};
