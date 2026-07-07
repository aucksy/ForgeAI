import Constants from 'expo-constants';

/**
 * Cloud config from app.json > extra. The publishable key is safe to ship
 * (RLS-guarded). The service-role/secret key is NEVER in the app.
 */
interface CloudExtra {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as CloudExtra;

export const SUPABASE_URL = extra.supabaseUrl ?? '';
export const SUPABASE_KEY = extra.supabasePublishableKey ?? '';

/** True when the build carries Supabase config at all. */
export function isCloudConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}

/** What syncs to the gym — shown at consent. Bump when the shared fields change. */
export const CONSENT_VERSION = '2026-07-07';
