/**
 * Navigation icons — one drawn family (24px grid, 1.75 stroke, round joins).
 *
 * The nav used to use text characters (◆ ☰ ▣ ✓ ▤ ₹ ⚙): each came from whatever
 * font had the glyph, so they differed in weight, size and baseline — the Visits
 * tick was a hairline next to a solid Money block.
 */

export type IconName = 'today' | 'members' | 'shop' | 'visits' | 'money' | 'plans' | 'settings' | 'more' | 'workouts';

const PATHS: Record<IconName, React.ReactNode> = {
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
