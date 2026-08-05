import { getAccessToken } from './client';
import { useAuth } from './useAuth';

export function assertAuthContract() {
  const auth = useAuth();

  auth.signInWithEmail('member@example.com');
  auth.signOut();

  const tokenPromise: Promise<string | null> = getAccessToken();

  return {
    loading: auth.loading,
    user: auth.user,
    session: auth.session,
    tokenPromise,
  };
}
