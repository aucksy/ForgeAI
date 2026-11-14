// Types for gymPage.js, so the admin app (TypeScript, no allowJs) uses the SAME facility list, address rules and page
// drawing as the Worker (the "Your web page" editor and its preview). Keep in step with the .js file; the admin app's
// typecheck and apps/dashboard/test/crm/gymPageEditor.test.ts fail when they drift apart.

export const PAGE_HOST: string;
export const PAGE_ORIGIN: string;
export const RESERVED_SLUGS: ReadonlySet<string>;
export const LIMITS: { about: number; photos: number; alt: number; highlights: number; area: number; address: number; slug: number };
/** The facilities an owner may tick: key -> the words on the page. */
export const HIGHLIGHTS: Readonly<Record<string, string>>;

export function gymSlug(name: string, area?: string, joinCode?: string): string;
export function slugOk(s: unknown): boolean;
export function photoOk(url: unknown): boolean;
export function mapsLinkOk(url: unknown): boolean;

/** The checked page (gym_page_public's answer as the page uses it). */
export interface GymPublicPage {
  slug: string;
  gymName: string;
  photos: { url: string; alt: string }[];
  [k: string]: unknown;
}
export function pageFrom(raw: unknown): GymPublicPage | null;
export function renderGymPage(p: GymPublicPage, opts?: { nowMs?: number; assetBase?: string; origin?: string; payOnline?: boolean }): string;
