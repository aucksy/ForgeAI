// F201: the MettleUp AI assistant's fixed catalogue (docs/f201-ai-assistant/03-design.md §2 and §6).
// ONE source for the panel worker (deploy/panel/assist.js: the tools Claude may call) and the admin app
// (apps/dashboard/src/crm/assistant/*: what each tool does, what it costs, which page it opens).
// Plain ES module, no imports, so both sides load it as is. Types: assistCatalogue.d.ts beside it.
// Tests: node --test deploy/panel/assistCatalogue.test.mjs (every page is a real route; every menu page is here).
//
// THE AI NEVER RUNS ANYTHING. It turns the owner's sentence into 1-3 of these tool calls. Our code answers the
// 'ask' ones from the gym's own reports, and shows a card for the rest that does nothing until the owner taps
// Send or Save. Names are STABLE once pushed (the server, the history rows and the tests use them).
//
// Schemas are written for Claude's strict tool use (structured outputs), whose limits shape them:
//  - at most 20 tools with strict: true per request  -> `cannot_do` (one free-text field) is not strict;
//  - at most 24 optional properties across all strict schemas -> EVERY property is required here, and an
//    empty value means "not said": "" for text, 0 for numbers, [] for lists (the panel fills the default);
//  - at most 16 union-type properties -> none used;
//  - no minimum/maximum/minLength/maxLength -> limits are in the descriptions and re-checked by our code
//    (apps/dashboard/src/crm/assistant/plan.ts validates every field before a card can be saved).
// Words for the owner live in the admin app (t() keys); descriptions here are for the AI only.

/** Credits a DONE task costs (03-design §3). Asking, talking back and drafting are free. */
export const CREDITS = Object.freeze({ ask: 0, talk: 0, message: 1, change: 1, content: 3 });

/** Strict tool-use limits we must stay under (checked by the test). */
export const STRICT_LIMITS = Object.freeze({ tools: 20, optional: 24, unions: 16 });

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const num = (description) => ({ type: 'number', description });
const oneOf = (values, description) => ({ type: 'string', enum: [...values], description });
const list = (items, description) => ({ type: 'array', items, description });
/** An object whose every property is required (see the strict limits above). */
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Time windows our reports understand. 'custom' uses from/to. */
export const PERIODS = Object.freeze([
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_30_days',
  'this_year',
  'custom',
]);

/**
 * Groups of members (list_members and draft_message's audience). Matches the admin app's own lists:
 * logic/audience.ts (everyone, active, ending, ended, away, birthday, plan, batch), homeTiles.ts,
 * attendance.ts atRiskList (away), collections.ts (owes).
 */
export const MEMBER_GROUPS = Object.freeze([
  'everyone', // every member who is not archived
  'active', // a running plan
  'ending', // plan ends in the next `days` (default 7)
  'ended', // plan ended in the last `days` (default 30)
  'away', // has a plan but no visit for `days` (default 10)
  'birthday_today',
  'birthday_week',
  'new_joins', // joined in the last `days` (default 30)
  'plan', // on the plan named in `plan`
  'batch', // in the batch named in `batch`
  'trainer', // personal training with the trainer named in `trainer`
  'owes', // has money due
  'no_app', // has not joined the MettleUp app
  'visited_today',
  'no_plan', // never bought a plan, or none running and none ended in 30 days
  'members', // only the people named in `names` (draft_message only)
]);

export const MESSAGE_KINDS = Object.freeze(['announcement', 'offer', 'event', 'closed', 'timing', 'reminder']);
export const MESSAGE_LANGS = Object.freeze(['gym', 'en', 'hi', 'both']);
export const PAY_METHODS = Object.freeze(['cash', 'upi', 'card', 'bank', 'other', 'none']);
export const EXPENSE_CATEGORIES = Object.freeze(['rent', 'salary', 'electricity', 'equipment', 'stock', 'repairs', 'other']);
export const GENDERS = Object.freeze(['', 'male', 'female', 'other']);

const PERIOD_FIELDS = {
  period: oneOf(PERIODS, 'The time window. Use this_month when none is said.'),
  from: str('First day YYYY-MM-DD, only for period custom; else "".'),
  to: str('Last day YYYY-MM-DD, only for period custom; else "".'),
};

const MEMBER_REF = str(
  'The member as the owner said the name ("Rahul", "Priya Sharma"). Never invent one. Our code matches it to the member list.',
);
const AMOUNT = num('Rupees (not paise). 0 = not said.');
const METHOD = oneOf(PAY_METHODS, 'How it was paid. "none" when not said.');

// ---------------------------------------------------------------- pages (open_page)

/**
 * Every page of the admin app the assistant may open (CrmApp.tsx `Screen()` + Settings tabs). `name` is the
 * page's name exactly as the menu or the page shows it; `does` is one plain line (also the AI's hint). A
 * `:id` path needs a member (or trainer) picked first. `owner` = only the owner may open it (permissions.ts).
 * The AI picks a page by `id` from an enum, so it can never invent a path.
 */
export const PAGES = Object.freeze([
  { id: 'today', path: '/', name: 'Today', does: 'What needs doing now: dues, plans ending, birthdays, requests.' },
  { id: 'setup', path: '/setup', name: 'Set up your gym', does: 'The steps to get your gym ready: plans, members, staff and trainers, the app.' },
  { id: 'members', path: '/members', name: 'Members', does: 'Every member: search, filter, add a member.' },
  { id: 'member-add', path: '/members/new', name: '+ Add member', does: 'Add a new member and sell their plan.' },
  { id: 'member-profile', path: '/members/:id', name: 'Member card', does: "One member's plan, payments, visits, renew, extend." },
  { id: 'members-app', path: '/members/app', name: 'Joined in the app', does: 'Members who joined the MettleUp app.' },
  { id: 'members-import', path: '/members/import', name: 'Import from Excel', does: 'Bring members in from an Excel sheet or old software.' },
  { id: 'renewals-due', path: '/numbers/renewals', name: 'Renewals due', does: 'Plans ending soon, to renew.' },
  { id: 'fees-due', path: '/numbers/owed', name: 'Fees due', does: 'Who owes money, and how much.', owner: true },
  { id: 'stopped-coming', path: '/numbers/stopped', name: 'Stopped coming', does: 'Members who stopped coming.' },
  { id: 'new-members', path: '/numbers/new', name: 'New members', does: 'Members who joined recently.' },
  { id: 'busy-hours', path: '/numbers/busy', name: 'Busy hours', does: 'When the gym is busiest.' },
  { id: 'money', path: '/money', name: 'Money', does: 'Collections: what came in, by day, plan and method.', owner: true },
  { id: 'money-today', path: '/money/today', name: 'Collections', does: "Today's collection.", owner: true },
  { id: 'dues', path: '/money/dues', name: 'Dues', does: 'Money members still owe; collect a payment.' },
  { id: 'visits', path: '/attendance', name: 'Visits', does: 'The check-in register: who came today or another day.' },
  { id: 'losing-habit', path: '/attendance/risk', name: 'Losing the habit', does: 'Members who have not come for many days.' },
  { id: 'checkin-qr', path: '/attendance/qr', name: 'Check-in QR', does: 'The QR members scan with the app to check in.' },
  { id: 'pass-visits', path: '/attendance/pass', name: 'Pass visits', does: 'Visits by FITPASS, cultpass and other pass members.' },
  { id: 'messages', path: '/messages', name: 'Messages & offers', does: 'Send messages, offers and wishes to members in the app.', owner: true },
  { id: 'workout-offer', path: '/messages/offer', name: 'Workout offer', does: 'A reward members earn by working out.' },
  { id: 'reminders', path: '/messages/reminders', name: 'Reminders', does: 'Automatic reminders members get before a plan ends.' },
  { id: 'member-messages', path: '/member-messages', name: 'Member messages', does: 'Questions, feedback and complaints members sent the gym.' },
  { id: 'invite', path: '/settings/invite', name: 'Invite members', does: "The gym's join link and the QR poster for the desk." },
  { id: 'plans', path: '/plans', name: 'Plans', does: 'Plans, prices and durations; make or change a plan.', owner: true },
  { id: 'enquiries', path: '/enquiries', name: 'Enquiries', does: 'People who asked about joining; follow-ups.' },
  { id: 'enquiry-add', path: '/enquiries/new', name: 'Add enquiry', does: 'Save a new enquiry.' },
  { id: 'expenses', path: '/expenses', name: 'Expenses', does: 'Money going out, and profit.', owner: true },
  { id: 'growth', path: '/growth', name: 'Your growth', does: 'Month by month: joins, leavers, money since MettleUp.', owner: true },
  { id: 'growth-print', path: '/growth/print', name: 'Growth report', does: 'One page to print or save as a PDF.', owner: true },
  { id: 'trainers', path: '/trainers', name: 'Trainers', does: "Trainers' hours and personal-training bookings." },
  { id: 'trainer-page', path: '/trainers/:id', name: 'Trainer', does: "One trainer's page and bookings." },
  { id: 'training-progress', path: '/trainer', name: 'Training progress', does: "Members' workout progress, and their trainer." },
  { id: 'questions', path: '/questions', name: 'Member questions', does: 'Members\' workout questions ("Ask about your workout" in their app).' },
  { id: 'workouts', path: '/workouts', name: 'Workout plans', does: 'Make and send workout routines to members.' },
  { id: 'diet', path: '/diet', name: 'Diet plans', does: 'Make and send diet plans to members.' },
  { id: 'challenges', path: '/challenges', name: 'Challenges', does: 'A monthly goal for members, and the leaderboard.' },
  { id: 'shop', path: '/shop', name: 'Shop', does: 'Orders members placed in the app.' },
  { id: 'shop-products', path: '/shop/products', name: 'Products', does: 'What the shop sells, and prices.', owner: true },
  { id: 'branding', path: '/settings/branding', name: 'Branding', does: 'Your logo and colours in the member app.', owner: true },
  { id: 'timings', path: '/settings/timings', name: 'Gym timings', does: 'When the gym is open, for members to see.' },
  { id: 'web-page', path: '/settings/web-page', name: 'Your web page', does: "The gym's free web page: address, about, photos, publish." },
  { id: 'settings', path: '/settings', name: 'Settings', does: 'Gym details: name, address, phone, GST, screen colours.' },
  { id: 'settings-app', path: '/settings/app', name: 'Member app', does: 'The member app: join code, look, features.' },
  { id: 'settings-data', path: '/settings/data', name: 'Sign-in & data', does: "Your gym's records: download, sign-in, start over." },
  { id: 'payments', path: '/settings/payments', name: 'Payments', does: 'UPI QR and online payments into your own account.', owner: true },
  { id: 'staff', path: '/settings/people', name: 'Staff & sign-in', does: 'Who can open this admin app, and their codes.' },
  { id: 'busy-machines', path: '/settings/machines', name: 'Busy machines', does: 'Machines members can see as busy in the app.' },
  { id: 'entry-machines', path: '/settings/entry', name: 'Entry machines', does: "Finger or face machines at your gym's door." },
  { id: 'pay-mettleup', path: '/settings/mettleup', name: 'Pay MettleUp', does: 'Pay for your MettleUp plan.', owner: true },
  { id: 'branches', path: '/branches', name: 'All branches', does: "Every branch's numbers together.", owner: true },
  { id: 'news', path: '/news', name: "What's new", does: 'Changes to this admin app.' },
  { id: 'help', path: '/feedback', name: 'Help and feedback', does: 'Ask a question, or tell MettleUp a problem or an idea.' },
]);

export const PAGE_IDS = Object.freeze(PAGES.map((p) => p.id));
/** Pages the AI may name: not the ones that need a member or trainer id (member_lookup opens those). */
export const AI_PAGE_IDS = Object.freeze(PAGES.filter((p) => !p.path.includes(':id')).map((p) => p.id));

/** The page with this id, or undefined. */
export function pageById(id) {
  return PAGES.find((p) => p.id === id);
}

/** A page's path with its `:id` filled (a member or trainer id); null when it needs one and none is given. */
export function pagePath(id, param) {
  const p = pageById(id);
  if (!p) return null;
  if (!p.path.includes(':id')) return p.path;
  return param ? p.path.replace(':id', encodeURIComponent(param)) : null;
}

// ---------------------------------------------------------------- tools

/**
 * The fixed task catalogue (03-design §2 A-F). `kind`: ask = read-only report, FREE; message = a message to
 * members, 1 credit when SENT; change = gym data, 1 credit when SAVED; content = a trainer draft, 3 credits
 * when SAVED; talk = ask back / open a page / cannot do, FREE. `strict`: sent with strict: true.
 */
export const TOOLS = Object.freeze([
  // ------------------------------------------------ A + F. Ask (answered by our own reports, never the AI)
  {
    name: 'list_members',
    kind: 'ask',
    description:
      'List members in a group: plans ending soon, ended, stopped coming, birthdays, new joins, a plan, a batch, ' +
      "a trainer's members, who owes, without the app, came today. Our code fills the list from the gym's records.",
    input_schema: obj({
      group: oneOf(MEMBER_GROUPS.filter((g) => g !== 'members'), 'Which members.'),
      days: int('Days for ending/ended/away/new_joins ("is hafte" = 7, "10 din" = 10). 0 = the usual default.'),
      plan: str('Plan name, only for group plan; else "".'),
      batch: str('Batch name, only for group batch; else "".'),
      trainer: str('Trainer first name, only for group trainer; else "".'),
      gender: oneOf(GENDERS, 'Only this gender; "" = everyone.'),
    }),
  },
  {
    name: 'who_owes',
    kind: 'ask',
    description: 'Who has not paid, and how much is due in total. Optionally one member.',
    input_schema: obj({ member: str('One member\'s name, or "" for everyone who owes.') }),
  },
  {
    name: 'money_summary',
    kind: 'ask',
    description:
      'Money collected in a period, compared with the period before; or by plan, by payment method, expenses ' +
      'by category, or profit (collected minus expenses).',
    input_schema: obj({
      ...PERIOD_FIELDS,
      breakdown: oneOf(['total', 'by_plan', 'by_method', 'expenses', 'profit'], 'What to show. total when not said.'),
    }),
  },
  {
    name: 'attendance_summary',
    kind: 'ask',
    description: 'Visits: how many came, the busiest hours, who is inside now, who came on a day.',
    input_schema: obj({
      ...PERIOD_FIELDS,
      focus: oneOf(['count', 'peak_hours', 'inside_now', 'who_came'], 'What to show. count when not said.'),
    }),
  },
  {
    name: 'growth_summary',
    kind: 'ask',
    description: 'How many joined and how many left in a period, and the active count.',
    input_schema: obj({ ...PERIOD_FIELDS }),
  },
  {
    name: 'member_lookup',
    kind: 'ask',
    description: "One member's full picture: plan and end date, dues, last visit, trainer, batch.",
    input_schema: obj({ member: MEMBER_REF }),
  },
  {
    name: 'week_summary',
    kind: 'ask',
    description: 'How the gym did in a week: joins, renewals, money, visits ("gym ka haal batao").',
    input_schema: obj({ week: oneOf(['last_week', 'this_week'], 'Which week. last_week when not said.') }),
  },
  {
    name: 'gym_numbers',
    kind: 'ask',
    description:
      'Counts and lists from the gym: members by plan, gender or batch; plans and prices; enquiries by status; ' +
      "follow-ups due today; trainers' PT members; members without the app; birthdays this week.",
    input_schema: obj({
      topic: oneOf(
        [
          'members_by_plan',
          'members_by_gender',
          'members_by_batch',
          'plans_and_prices',
          'enquiries',
          'followups_today',
          'trainers',
          'without_app',
          'birthdays_week',
        ],
        'Which numbers.',
      ),
    }),
  },
  {
    name: 'how_to',
    kind: 'ask',
    description:
      'How to do something in the MettleUp admin app or member app, answered from the help articles. Only when ' +
      'no single admin page answers it; when one page does, use open_page alone. Never together with open_page.',
    input_schema: obj({ question: str('The question in plain English.') }),
  },
  // ------------------------------------------------ B. Message members
  {
    name: 'draft_message',
    kind: 'message',
    description:
      'Write an in-app message to a group of members (festival wishes, offer, reminder, gym closed, timing ' +
      'change, event). The owner checks and sends it. Title at most 60 letters, body at most 300. Hindi in ' +
      'Devanagari. Never put a phone number, link or price the owner did not give.',
    input_schema: obj({
      audience: obj({
        group: oneOf(MEMBER_GROUPS, 'Who gets it.'),
        days: int('Days for ending/ended/away/new_joins. 0 = the usual default.'),
        plan: str('Plan name for group plan; else "".'),
        batch: str('Batch name for group batch; else "".'),
        trainer: str('Trainer first name for group trainer; else "".'),
        names: list(str('A member name'), 'Names for group members; else [].'),
      }),
      kind: oneOf(MESSAGE_KINDS, 'announcement for wishes and news; offer for a discount; closed for a holiday.'),
      lang: oneOf(MESSAGE_LANGS, 'gym = the gym\'s saved language (use when not said); hi = Hindi; both = English + Hindi.'),
      title_en: str('English title, or "" when lang is hi.'),
      body_en: str('English text, or "" when lang is hi.'),
      title_hi: str('Hindi title in Devanagari, or "" when lang is en.'),
      body_hi: str('Hindi text in Devanagari, or "" when lang is en.'),
      send_at: str(
        'When to SEND it, YYYY-MM-DDTHH:mm India time, only when the owner said when to send ("kal subah 8 baje bhejo"); ' +
          'else "" = now. Never the day the gym is closed.',
      ),
      day: str(
        'For kind closed or timing: the day the gym is closed or the timing changes, YYYY-MM-DD ("kal" = tomorrow). ' +
          '"" when the owner did not say the day, and "" for other kinds.',
      ),
      offer: str('The offer in a few words ("20% off 3 months till 15 Nov"), or "".'),
    }),
  },
  // ------------------------------------------------ C. Change gym data (confirm card)
  {
    name: 'add_member',
    kind: 'change',
    description: 'Add a new member, optionally with a plan sold and a payment taken.',
    input_schema: obj({
      name: str('Full name as said.'),
      phone: str('Mobile number or its placeholder like [PHONE_1]; "" when not said.'),
      gender: oneOf(GENDERS, '"" when not said.'),
      plan: str('Plan name as said; "" = no plan now.'),
      months: int('Months if said and different from the plan; else 0.'),
      start: str('First day YYYY-MM-DD; "" = today.'),
      amount_paid: AMOUNT,
      method: METHOD,
      batch: str('Batch name or "".'),
      notes: str('Anything else said, or "".'),
    }),
  },
  {
    name: 'renew',
    kind: 'change',
    description: "Renew a member's plan. It starts the day after the current plan ends.",
    input_schema: obj({
      member: MEMBER_REF,
      plan: str('Plan name if a different plan is said; "" = the same plan.'),
      months: int('Months if said and different from the plan; else 0.'),
      amount_paid: AMOUNT,
      method: METHOD,
    }),
  },
  {
    name: 'record_payment',
    kind: 'change',
    description: 'Record money a member paid against what they owe.',
    input_schema: obj({ member: MEMBER_REF, amount: num('Rupees paid.'), method: METHOD, note: str('Note or "".') }),
  },
  {
    name: 'extend',
    kind: 'change',
    description: "Give a member free days: move their plan's end date (illness, travel, gym closed).",
    input_schema: obj({ member: MEMBER_REF, days: int('Free days to add.'), reason: str('Why, in a few words, or "".') }),
  },
  {
    name: 'add_enquiry',
    kind: 'change',
    description: 'Save a person who asked about joining, with when to call them back.',
    input_schema: obj({
      name: str('Name as said.'),
      phone: str('Mobile number or its placeholder like [PHONE_1]; "" when not said.'),
      interest: str('What they asked about ("PT", "3 months evening"), or "".'),
      follow_up: str('Call-back day YYYY-MM-DD ("Monday" = the coming Monday); "" = none.'),
      notes: str('Anything else, or "".'),
    }),
  },
  {
    name: 'add_expense',
    kind: 'change',
    description: 'Record money the gym spent (rent, salary, electricity bill, equipment, repairs).',
    input_schema: obj({
      amount: num('Rupees spent.'),
      category: oneOf(EXPENSE_CATEGORIES, 'stock = supplement stock; other when unsure.'),
      date: str('Day YYYY-MM-DD; "" = today.'),
      method: METHOD,
      note: str('What it was for, or "".'),
    }),
  },
  // ------------------------------------------------ D. Create content (a draft for the trainer to check)
  {
    name: 'draft_workout_plan',
    kind: 'content',
    description: 'Draft a workout plan for a member or a goal. Saved as a draft for the trainer to check, never sent.',
    input_schema: obj({
      member: str('Member name, or "" for a plan for a goal.'),
      goal: oneOf(['fat_loss', 'muscle_gain', 'strength', 'general_fitness', 'beginner'], 'The goal.'),
      days_per_week: int('Training days a week (2-6); 0 = 4.'),
      level: oneOf(['beginner', 'intermediate', 'advanced'], 'beginner when not said.'),
      notes: str('Injuries, equipment or anything else said, or "".'),
    }),
  },
  {
    name: 'draft_diet_plan',
    kind: 'content',
    description: 'Draft a diet plan for a member or a goal. Saved as a draft for the trainer to check, never sent.',
    input_schema: obj({
      member: str('Member name, or "" for a plan for a goal.'),
      goal: oneOf(['fat_loss', 'muscle_gain', 'general_fitness'], 'The goal.'),
      food: oneOf(['veg', 'egg', 'non_veg', 'vegan', 'any'], 'Food preference; veg when not said.'),
      notes: str('Allergies or anything else said, or "".'),
    }),
  },
  // ------------------------------------------------ E. Talk back and show the way (FREE)
  {
    name: 'ask_back',
    kind: 'talk',
    description: 'Ask one short question when the request is unclear, with 2-4 answers to tap.',
    input_schema: obj({ question: str('One short question.'), options: list(str('A short answer'), '2-4 answers.') }),
  },
  {
    name: 'open_page',
    kind: 'talk',
    description:
      'Show where in the admin app to do something, with up to 3 steps: a how-to that one page answers (change ' +
      'the logo, a plan price, timings, staff), or something the assistant cannot do itself. Use it alone, never ' +
      'together with how_to. Pick the page from the list.',
    input_schema: obj({
      page: oneOf(AI_PAGE_IDS, 'The page to open.'),
      steps: list(str('One short step'), 'Up to 3 short steps on that page, or [].'),
      why: str('One short line: what he can do there.'),
    }),
  },
  {
    name: 'cannot_do',
    kind: 'talk',
    strict: false,
    description: 'Only when no tool and no page fits (for example "call this member"). Say so in one short line. Do not send the owner to a page or a member\'s page: the card only offers Help and feedback.',
    input_schema: obj({ reason: str('One short line.') }),
  },
]);

/** Kind and credits of every tool, by name. */
export const TOOL_KIND = Object.freeze(Object.fromEntries(TOOLS.map((t) => [t.name, t.kind])));
export const TOOL_CREDITS = Object.freeze(Object.fromEntries(TOOLS.map((t) => [t.name, CREDITS[t.kind]])));

/** The tool with this name, or undefined. */
export function toolByName(name) {
  return TOOLS.find((t) => t.name === name);
}

/** Credits the task costs when it is DONE (sum of its actions; asks and talk are 0). */
export function creditsFor(actions) {
  return (actions ?? []).reduce((sum, a) => sum + (TOOL_CREDITS[a?.tool] ?? 0), 0);
}

/**
 * The tools in the shape the Messages API takes (name, description, input_schema). NOT strict (13 Nov 2026,
 * R-483): live, Claude refused every request with 400 "The compiled grammar is too large ... reduce the number of
 * strict tools". The per-count limits above were all met; the grammar SIZE is a limit no offline test can see.
 * The schemas stay closed and fully required, and our own checks (plan.ts) still validate every field.
 */
export function toolsForClaude() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

// ---------------------------------------------------------------- "Try saying" examples

/**
 * Shown on first visit, grouped; a tap fills the box. Also the real-AI test set: each must lead to `tool`
 * (and `expect`'s fields, when given, must match the tool's input). Hinglish in Latin letters first, a few
 * English, a few Devanagari. Names are made up (the test gym in apps/dashboard/test/crm/assistant/fixture.ts).
 */
export const EXAMPLE_GROUPS = Object.freeze(['messages', 'members', 'money', 'questions', 'settings']);

export const EXAMPLES = Object.freeze([
  // Messages
  { group: 'messages', text: 'Sab members ko 20% off offer bhejo, is Sunday tak', tool: 'draft_message', expect: { kind: 'offer' } },
  { group: 'messages', text: 'Jinka plan is hafte khatam ho raha hai unko renewal reminder bhejo', tool: 'draft_message', expect: { kind: 'reminder' } },
  { group: 'messages', text: 'Kal gym band rahega, sabko bata do', tool: 'draft_message', expect: { kind: 'closed' } },
  { group: 'messages', text: 'Jo 10 din se nahi aaye unko "we miss you" message bhejo', tool: 'draft_message' },
  { group: 'messages', text: 'Aaj jinka birthday hai unko wish karo', tool: 'draft_message' },
  { group: 'messages', text: 'Morning batch ko bolo kal se gym 5:30 baje khulega', tool: 'draft_message', expect: { kind: 'timing' } },
  { group: 'messages', text: 'Send a polite fee reminder to everyone who owes money', tool: 'draft_message' },
  { group: 'messages', text: 'सभी सदस्यों को बताओ कि रविवार को जिम बंद रहेगा', tool: 'draft_message', expect: { lang: 'hi', kind: 'closed' } },
  // Members
  { group: 'members', text: 'Rahul Sharma ko add karo, 3 mahine Gold, 4500 cash', tool: 'add_member', expect: { method: 'cash' } },
  { group: 'members', text: 'Priya ka plan renew karo 1 mahina, UPI 1500', tool: 'renew', expect: { method: 'upi' } },
  { group: 'members', text: 'Neha ka plan 7 din badha do, bimar thi', tool: 'extend', expect: { days: 7 } },
  { group: 'members', text: 'Kal Rohit aaya tha, PT chahiye, Monday call karna', tool: 'add_enquiry' },
  { group: 'members', text: 'Amit ka plan kab khatam hoga?', tool: 'member_lookup' },
  { group: 'members', text: 'Make a beginner fat loss workout plan for Sunita', tool: 'draft_workout_plan', expect: { goal: 'fat_loss' } },
  // Money
  { group: 'money', text: 'Kisne paise nahi diye?', tool: 'who_owes' },
  { group: 'money', text: 'Is mahine kitna collection hua?', tool: 'money_summary', expect: { period: 'this_month' } },
  { group: 'money', text: 'Amit ne 2000 diye cash mein', tool: 'record_payment', expect: { amount: 2000, method: 'cash' } },
  { group: 'money', text: 'Bijli ka bill 3200 diya', tool: 'add_expense', expect: { category: 'electricity', amount: 3200 } },
  { group: 'money', text: 'Pichle mahine ka profit kitna tha?', tool: 'money_summary', expect: { period: 'last_month', breakdown: 'profit' } },
  { group: 'money', text: 'इस महीने कितना पैसा आया?', tool: 'money_summary', expect: { period: 'this_month' } },
  // Questions
  { group: 'questions', text: 'Jinka plan is hafte khatam ho raha hai?', tool: 'list_members', expect: { group: 'ending' } },
  { group: 'questions', text: '10 din se kaun nahi aaya?', tool: 'list_members', expect: { group: 'away', days: 10 } },
  { group: 'questions', text: 'Aaj kitne log aaye?', tool: 'attendance_summary', expect: { period: 'today' } },
  { group: 'questions', text: 'Sabse busy time kya hai?', tool: 'attendance_summary', expect: { focus: 'peak_hours' } },
  { group: 'questions', text: 'Gym ka haal batao', tool: 'week_summary' },
  { group: 'questions', text: 'How many people joined this month and how many left?', tool: 'growth_summary' },
  { group: 'questions', text: 'आज किसका जन्मदिन है?', tool: 'list_members', expect: { group: 'birthday_today' } },
  // Settings help
  { group: 'settings', text: 'QR check-in kaise lagate hain?', tool: 'how_to' },
  { group: 'settings', text: 'Gold plan ka price badalna hai', tool: 'open_page', expect: { page: 'plans' } },
  { group: 'settings', text: 'Gym ka logo kaise badlein?', tool: 'open_page', expect: { page: 'branding' } },
  { group: 'settings', text: 'Change our Sunday timings', tool: 'open_page', expect: { page: 'timings' } },
  { group: 'settings', text: 'Naye staff ko login kaise dun?', tool: 'open_page', expect: { page: 'staff' } },
]);
