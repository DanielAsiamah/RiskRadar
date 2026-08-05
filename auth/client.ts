import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
export const webAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || '';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && webAppUrl);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
