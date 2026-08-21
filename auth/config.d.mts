export interface PublicAuthConfig {
  configured: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
  webAppUrl: string;
  error: string | null;
}

export function readPublicAuthConfig(
  env: Record<string, string | undefined>,
): PublicAuthConfig;

export type SupabaseKeyKind =
  | 'missing'
  | 'publishable'
  | 'secret'
  | 'anon'
  | 'service_role'
  | 'unknown';

export function classifySupabaseKey(value: unknown): SupabaseKeyKind;
