import type { PropsWithChildren } from 'react';
import React, { createContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, webAppUrl } from './client';

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function cleanupAuthCallbackUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete('auth');
  currentUrl.searchParams.delete('code');
  currentUrl.searchParams.delete('type');
  currentUrl.hash = '';
  window.history.replaceState({}, document.title, currentUrl.toString());
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    const supabaseClient = supabase;
    let active = true;

    const syncSession = async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!active) {
        return;
      }

      setSession(data.session ?? null);
      if (typeof window !== 'undefined' && window.location.search.includes('auth=callback')) {
        cleanupAuthCallbackUrl();
      }
      setLoading(false);
    };

    syncSession();

    const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession ?? null);
      setLoading(false);
      if (typeof window !== 'undefined' && window.location.search.includes('auth=callback')) {
        cleanupAuthCallbackUrl();
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    async signInWithEmail(email) {
      if (!supabaseConfigured || !supabase) {
        throw new Error('Supabase Auth is not configured for this build.');
      }

      const redirectUrl = `${webAppUrl}?auth=callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        throw error;
      }
    },
    async signOut() {
      if (!supabase) {
        setSession(null);
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
