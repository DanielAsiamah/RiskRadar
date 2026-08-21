import path from 'node:path';
import { fileURLToPath } from 'node:url';
import expoEnv from '@expo/env';
import { classifySupabaseKey } from '../auth/config.mjs';

const { parseProjectEnv } = expoEnv;

export const BACKEND_SECRET_ENV_KEYS = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BILLING_REFERENCE_SECRET',
  'ADMIN_API_KEY',
  'DATABASE_URL',
];

const SECRET_VALUE_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]+/,
  /sk_(?:test|live)_[A-Za-z0-9_-]+/,
  /whsec_[A-Za-z0-9_-]+/,
];

export function readExpoBuildEnvironment(projectRoot, systemEnv = process.env) {
  const parsed = parseProjectEnv(projectRoot, {
    // Expo export uses production dotenv files even when the parent shell has
    // no NODE_ENV value, so the guard must make the same choice.
    mode: systemEnv.NODE_ENV || 'production',
    silent: true,
    systemEnv,
  });

  // Shell/hosting values take priority over dotenv files, matching Expo.
  return {
    ...parsed.env,
    ...systemEnv,
  };
}

export function findUnsafePublicEnvironment(env) {
  const problems = [];
  const backendSecrets = BACKEND_SECRET_ENV_KEYS.flatMap((key) => {
    const value = typeof env[key] === 'string' ? env[key].trim() : '';
    return value.length >= 8 ? [value] : [];
  });

  for (const [key, rawValue] of Object.entries(env).sort(([left], [right]) => left.localeCompare(right))) {
    if (!key.startsWith('EXPO_PUBLIC_') || typeof rawValue !== 'string' || !rawValue.trim()) {
      continue;
    }

    const value = rawValue.trim();
    const keyKind = classifySupabaseKey(value);
    const secretShaped = SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
    const matchesBackendSecret = backendSecrets.some((secret) => value.includes(secret));
    if (!secretShaped && !matchesBackendSecret && keyKind !== 'service_role') {
      continue;
    }

    problems.push({
      key,
      message: 'Backend credential detected. Expo public variables are compiled into the client bundle.',
    });
  }

  return problems;
}

function runCli() {
  const environment = readExpoBuildEnvironment(process.cwd(), process.env);
  const problems = findUnsafePublicEnvironment(environment);
  if (problems.length === 0) {
    console.log('Expo public environment contains no backend credentials.');
    return;
  }

  console.error('Web build blocked because private credentials were assigned to public variables:');
  for (const problem of problems) {
    console.error(`- ${problem.key}: ${problem.message}`);
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runCli();
}
