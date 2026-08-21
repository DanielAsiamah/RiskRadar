export function createSupabaseAdminHeaders(adminKey, extraHeaders = {}) {
  const headers = {
    apikey: adminKey,
  };

  // Current sb_secret keys are API keys, not JWTs. Legacy service-role JWTs
  // still require the bearer header for direct PostgREST administration.
  if (!String(adminKey || '').startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${adminKey}`;
  }

  return {
    ...headers,
    ...extraHeaders,
  };
}
