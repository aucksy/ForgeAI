/**
 * Chart ranges in months, for the free part of MettleUp Plus. PURE.
 *
 * History: tracker #43 (24 Oct 2026) had a server switch here (0032 app_limits, 'free_limits') limiting routines,
 * own exercises and charts for members in no gym. F56 MettleUp Plus (R-461, 12 Nov 2026) replaced it: routines
 * are free for everyone, and the rules for own exercises and charts are in packages/theme/src/memberPlan.ts
 * (one switch in the app, MEMBER_PLAN_GATE_ON). The server switch is no longer read.
 */

/** The months a chart range shows (null = all time): exercise charts '3m'/'1y'/'all', Profile 'weeks'/'year'/'all', Statistics '30d'/'3m'/'1y'/'all'. PURE. */
export function monthsOfRange(range: string): number | null {
  switch (range) {
    case '30d':
      return 1;
    case '3m':
    case 'weeks': // the Profile's "Last 3 months" (R-500; drawn in weeks, the id kept)
      return 3;
    case '1y':
    case 'year':
      return 12;
    default:
      return null;
  }
}
