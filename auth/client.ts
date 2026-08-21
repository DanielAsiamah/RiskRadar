import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { readPublicAuthConfig } from './config.mjs';
import { authStorage } from './storage';

const publicAuthConfig = readPublicAuthConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_WEB_APP_URL: process.env.EXPO_PUBLIC_WEB_APP_URL,
});

export const supabaseConfigured = publicAuthConfig.configured;
export const webAppUrl = publicAuthConfig.webAppUrl;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(publicAuthConfig.supabaseUrl, publicAuthConfig.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        storage: authStorage,
      },
    })
  : null;

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getStoredSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}
