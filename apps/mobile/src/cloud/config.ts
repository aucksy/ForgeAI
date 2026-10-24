import Constants from 'expo-constants';

import { proxyList } from './address';

/**
 * Cloud config from app.json > extra. The publishable key is safe to ship
 * (RLS-guarded). The service-role/secret key is NEVER in the app.
 */
interface CloudExtra {
  supabaseUrl?: string;
  /** R-55: our own address for the same server (the panel Worker's /sb), tried first. */
  supabaseProxyUrl?: string;
  /** MettleUp (R-105): our older addresses, tried after it (the old host stays for good). */
  supabaseProxyFallbackUrls?: string[];
  supabasePublishableKey?: string;
  /** The Google Web OAuth client id (Drive backup and the member account); a placeholder until set. */
  googleWebClientId?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as CloudExtra;

export const SUPABASE_URL = extra.supabaseUrl ?? '';
/** R-55: the block-proof address (cloud/address.ts); empty = Supabase's own address only. */
export const SUPABASE_PROXY_URL = extra.supabaseProxyUrl ?? '';
/** Every address of ours, newest first (cloud/address.ts tries them in this order); empty = Supabase's own only. */
export const SUPABASE_PROXY_URLS: readonly string[] = proxyList(extra.supabaseProxyUrl, extra.supabaseProxyFallbackUrls);
export const SUPABASE_KEY = extra.supabasePublishableKey ?? '';

/** True when the build carries Supabase config at all. */
export function isCloudConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}

export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId ?? '';

/**
 * The member account (#43/#50) exists in this build: the server AND a real Google client id. Until
 * the owner's Google setup is done this is false, and the account, its copy and the free limits'
 * server read make no network call at all.
 */
export function isAccountBuild(): boolean {
  return isCloudConfigured() && GOOGLE_WEB_CLIENT_ID.length > 0 && !GOOGLE_WEB_CLIENT_ID.startsWith('REPLACE_WITH');
}

/** What syncs to the gym — shown at consent. Bump when the shared fields change. */
export const CONSENT_VERSION = '2026-07-07';
