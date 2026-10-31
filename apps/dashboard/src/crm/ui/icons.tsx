/**
 * Navigation icons — one drawn family (24px grid, 1.75 stroke, round joins).
 *
 * The nav used to use text characters (◆ ☰ ▣ ✓ ▤ ₹ ⚙): each came from whatever
 * font had the glyph, so they differed in weight, size and baseline — the Visits
 * tick was a hairline next to a solid Money block.
 */

export type IconName = 'today' | 'members' | 'shop' | 'visits' | 'money' | 'plans' | 'settings' | 'more' | 'workouts' | 'messages' | 'branches' | 'brand' | 'clock' | 'trophy' | 'growth' | 'diet' | 'enquiries' | 'key' | 'invite' | 'news' | 'feedback' | 'bell';

const PATHS: Record<IconName, React.ReactNode> = {
  // #41: two buildings side by side: "every branch".
  branches: (
    <>
      <path d="M3 20.5V9l5-3.5L13 9v11.5" />
      <path d="M13 20.5V12l4-3 4 3v8.5" />
      <path d="M2 20.5h20" />
      <path d="M6.5 20.5v-4h3v4" />
    </>
  ),
  // Four squares: "everything else" (the phone's More tab).
  more: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  today: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h13V9" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.4c2.1.8 3.5 2.8 3.5 5.6" />
    </>
  ),
  shop: (
    <>
      <path d="M5 8h14l-1.1 12H6.1L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  visits: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  // A line going up over a base: "Your growth".
  growth: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="m4.5 16 5-5 3.5 3.5 6.5-7" />
      <path d="M15 7.5h4.5V12" />
    </>
  ),
  money: (
    <>
      <path d="M4 8V7.5A2.5 2.5 0 0 1 6.5 5H17v3" />
      <rect x="4" y="8" width="16.5" height="11" rx="2.5" />
      <path d="M15.5 13.5h2" />
    </>
  ),
  plans: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  // A dumbbell: workout plans from the gym or trainer.
  workouts: (
    <>
      <path d="M7.5 12h9" />
      <rect x="4.5" y="7" width="3" height="10" rx="1" />
      <rect x="16.5" y="7" width="3" height="10" rx="1" />
      <path d="M2.5 10v4M21.5 10v4" />
    </>
  ),
  // A speech bubble with two lines: Messages & offers.
  messages: (
    <>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  // A paint palette: Branding (the gym's logo and colours).
  brand: (
    <>
      <path d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.7 0 4.3 3.4 7.3 7 7.3 1.6 0 2.2-.9 2.2-1.8 0-1.3-1.1-1.5-1.1-2.7 0-1 .8-1.7 1.9-1.7h2.2c2 0 3.3-1.2 3.3-3.1 0-3-3.4-5.7-7-5.7Z" />
      <circle cx="7.8" cy="11" r="1.1" />
      <circle cx="10.8" cy="7.6" r="1.1" />
      <circle cx="15.2" cy="8" r="1.1" />
    </>
  ),
  // A clock: Gym timings (R-124).
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // A cup: Challenges (R-133).
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H4.5v1.5A3 3 0 0 0 8 10.5M16 6h3.5v1.5a3 3 0 0 1-3.5 3" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  // UAT A-17 (30 Oct 2026): every More row gets its own picture.
  // An apple: Diet plans.
  diet: (
    <>
      <path d="M12 7.5c-1.6-1.2-4.6-1.4-6.2.6-1.9 2.4-1.2 6.9.9 9.8 1.2 1.6 2.7 2.6 4 1.9.8-.4 1.8-.4 2.6 0 1.3.7 2.8-.3 4-1.9 2.1-2.9 2.8-7.4.9-9.8-1.6-2-4.6-1.8-6.2-.6Z" />
      <path d="M12 7.5c0-2 1-3.5 3-4" />
    </>
  ),
  // A phone with a question: Enquiries (people who asked about joining).
  enquiries: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10 9.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3v.4" />
      <path d="M12 15.6v.1M10.5 18.5h3" />
    </>
  ),
  // A key: Staff & sign-in.
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      <path d="m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  // A QR square: Invite members (link and QR poster).
  invite: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h1.5M20.5 14v1.5" />
    </>
  ),
  // A spark: What's new.
  news: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z" />
      <path d="M18.5 16v4M16.5 18h4" />
    </>
  ),
  // A bell: Notifications (R-239).
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  // A speech bubble with "!": Send feedback.
  feedback: (
    <>
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M12 8.5v3.5M12 14.2v.1" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="10" cy="17" r="2.5" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
