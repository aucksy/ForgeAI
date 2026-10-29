/**
 * @forgeai/theme — shared by apps/mobile and apps/dashboard.
 *  - palette.ts: the raw palette + spacing/radius scales (platform-neutral plain values).
 *  - brand.ts: gym branding, Level 1 — one brand colour (+ optional background tone) → the full
 *    phone palette with its WCAG checks. The app repaints itself with it; the panel previews it.
 */
export * from './palette';
export * from './brand';
// R-160: the brand colour read from the gym's logo (pixels in, a suggestion out; no AI).
export * from './logoColour';
// R-124: the gym's opening hours (rules, India-time "open now", words), shared so both apps agree.
export * from './gymHours';
