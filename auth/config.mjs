function readString(env, key) {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function decodeBase64Url(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const input = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let accumulator = 0;
  let bits = 0;
  let decoded = '';

  for (const character of input) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      return '';
    }

    accumulator = (accumulator << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      decoded += String.fromCharCode((accumulator >> bits) & 0xff);
      accumulator &= bits ? (1 << bits) - 1 : 0;
    }
  }

  return decoded;
}

function readLegacyJwtRole(value) {
  if (!value.startsWith('eyJ')) {
    return null;
  }

  try {
    const payload = value.split('.')[1];
    const decoded = JSON.parse(decodeBase64Url(payload));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

export function classifySupabaseKey(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return 'missing';
  }
  if (normalized.startsWith('sb_publishable_')) {
    return 'publishable';
  }
  if (normalized.startsWith('sb_secret_')) {
    return 'secret';
  }

  const legacyRole = readLegacyJwtRole(normalized);
  if (legacyRole === 'anon') {
    return 'anon';
  }
  if (legacyRole === 'service_role') {
    return 'service_role';
  }
  return 'unknown';
}

export function readPublicAuthConfig(env) {
  const supabaseUrl = readString(env, 'EXPO_PUBLIC_SUPABASE_URL');
  const supabasePublishableKey = readString(env, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
    readString(env, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const webAppUrl = readString(env, 'EXPO_PUBLIC_WEB_APP_URL');
  const keyKind = classifySupabaseKey(supabasePublishableKey);
  const safePublishableKey = keyKind === 'publishable' || keyKind === 'anon';
  const unsafeKeyProvided = Boolean(supabasePublishableKey && !safePublishableKey);

  return {
    configured: Boolean(supabaseUrl && safePublishableKey && webAppUrl),
    supabaseUrl,
    supabasePublishableKey,
    webAppUrl,
    error: unsafeKeyProvided
      ? 'The frontend Supabase key must be publishable, never secret.'
      : null,
  };
}
