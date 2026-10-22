import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { routedFetch, sessionKey } from '@/cloud/address';
import { SUPABASE_KEY, SUPABASE_PROXY_URL, SUPABASE_URL, isCloudConfigured } from '@/cloud/config';

/**
 * Lazily-constructed Supabase client. Nothing here runs until the app is linked
 * to a gym (see cloud/session.isCloudLinked) — the offline demo with no account
 * never calls getSupabase(), so it constructs no client and makes zero network
 * calls. Beta stores the session in AsyncStorage (scale path: encrypted SecureStore).
 */
let client: SupabaseClient | null = null;
let appStateWired = false;

export function getSupabase(): SupabaseClient {
  if (!isCloudConfigured()) {
    throw new Error('Cloud is not configured (missing Supabase extra in app.json).');
  }
  if (!client) {
    // R-55: our own address first (cloud/address.ts), Supabase's own when ours fails to answer.
    const url = SUPABASE_PROXY_URL || SUPABASE_URL;
    client = createClient(url, SUPABASE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storageKey: sessionKey(SUPABASE_URL), // what was kept before the switch stays readable
      },
      global: url === SUPABASE_URL ? undefined : { fetch: routedFetch(url, SUPABASE_URL, (...a) => fetch(...a)) },
    });
    if (!appStateWired) {
      appStateWired = true;
      // Refresh the auth token only while the app is foregrounded.
      AppState.addEventListener('change', (state) => {
        if (!client) return;
        // quiet: a refresh that fails (offline) is retried by the client itself.
        if (state === 'active') void client.auth.startAutoRefresh();
        else void client.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}

/** Whether a client has been constructed this session (i.e. cloud was touched). */
export function hasSupabase(): boolean {
  return client !== null;
}
