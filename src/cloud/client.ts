import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_KEY, SUPABASE_URL, isCloudConfigured } from '@/cloud/config';

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
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    if (!appStateWired) {
      appStateWired = true;
      // Refresh the auth token only while the app is foregrounded.
      AppState.addEventListener('change', (state) => {
        if (!client) return;
        if (state === 'active') client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}

/** Whether a client has been constructed this session (i.e. cloud was touched). */
export function hasSupabase(): boolean {
  return client !== null;
}
