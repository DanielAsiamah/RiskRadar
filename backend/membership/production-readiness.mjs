import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readString(env, key) {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return !value ||
    normalized.includes('your-project') ||
    normalized.includes('your-backend') ||
    normalized.includes('your-frontend') ||
    normalized.includes('change-me') ||
    normalized.includes('replace-me') ||
    normalized.includes('example.supabase.co') ||
    normalized.includes('example.com') ||
    value.includes('<') ||
    value.includes('>');
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readLegacyJwtRole(value) {
  if (!value.startsWith('eyJ')) {
    return null;
  }

  try {
    const payload = value.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(globalThis.atob(padded));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

function sameUrl(left, right) {
  const normalize = (value) => String(value || '').replace(/\/+$/, '');
  return normalize(left) === normalize(right);
}

function addError(errors, key, message) {
  if (!errors.some((error) => error.key === key)) {
    errors.push({ key, message });
  }
}

export function checkMembershipReadiness(env) {
  const errors = [];
  const production = readString(env, 'NODE_ENV') === 'production';
  const supabaseUrl = readString(env, 'SUPABASE_URL');
  const supabaseAdminKey = readString(env, 'SUPABASE_SECRET_KEY') ||
    readString(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const publicSupabaseUrl = readString(env, 'EXPO_PUBLIC_SUPABASE_URL');
  const publicSupabaseKey = readString(env, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
    readString(env, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const stripeSecretKey = readString(env, 'STRIPE_SECRET_KEY');
  const stripeWebhookSecret = readString(env, 'STRIPE_WEBHOOK_SECRET');
  const stripePriceId = readString(env, 'STRIPE_PREMIUM_PRICE_ID');
  const stripePaymentLinkUrl = readString(env, 'STRIPE_PAYMENT_LINK_URL');
  const billingReferenceSecret = readString(env, 'BILLING_REFERENCE_SECRET');
  const webAppUrl = readString(env, 'WEB_APP_URL');
  const publicWebAppUrl = readString(env, 'EXPO_PUBLIC_WEB_APP_URL');

  const requiredValues = [
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SECRET_KEY', supabaseAdminKey],
    ['EXPO_PUBLIC_SUPABASE_URL', publicSupabaseUrl],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publicSupabaseKey],
    ['STRIPE_SECRET_KEY', stripeSecretKey],
    ['STRIPE_WEBHOOK_SECRET', stripeWebhookSecret],
    ['STRIPE_PREMIUM_PRICE_ID', stripePriceId],
    ['STRIPE_PAYMENT_LINK_URL', stripePaymentLinkUrl],
    ['BILLING_REFERENCE_SECRET', billingReferenceSecret],
    ['WEB_APP_URL', webAppUrl],
    ['EXPO_PUBLIC_WEB_APP_URL', publicWebAppUrl],
  ];

  for (const [key, value] of requiredValues) {
    if (!value) {
      addError(errors, key, 'Set this environment variable before enabling Premium.');
    } else if (isPlaceholder(value)) {
      addError(errors, key, 'Replace the placeholder with the deployment-specific value.');
    }
  }

  const backendSupabase = parseUrl(supabaseUrl);
  if (supabaseUrl && (!backendSupabase || backendSupabase.protocol !== 'https:')) {
    addError(errors, 'SUPABASE_URL', 'Use the HTTPS project URL from Supabase.');
  }

  const frontendSupabase = parseUrl(publicSupabaseUrl);
  if (publicSupabaseUrl && (!frontendSupabase || frontendSupabase.protocol !== 'https:')) {
    addError(errors, 'EXPO_PUBLIC_SUPABASE_URL', 'Use the same HTTPS Supabase project URL as the backend.');
  } else if (supabaseUrl && publicSupabaseUrl && !sameUrl(supabaseUrl, publicSupabaseUrl)) {
    addError(errors, 'EXPO_PUBLIC_SUPABASE_URL', 'Use the same Supabase project for frontend and backend.');
  }

  const legacyAdminRole = readLegacyJwtRole(supabaseAdminKey);
  if (supabaseAdminKey && !supabaseAdminKey.startsWith('sb_secret_') && legacyAdminRole !== 'service_role') {
    addError(errors, 'SUPABASE_SECRET_KEY', 'Use an sb_secret key or the legacy service_role JWT.');
  }
  const legacyPublicRole = readLegacyJwtRole(publicSupabaseKey);
  if (publicSupabaseKey && !publicSupabaseKey.startsWith('sb_publishable_') && legacyPublicRole !== 'anon') {
    addError(errors, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'Use an sb_publishable key or the legacy anon JWT.');
  }
  if (stripeSecretKey && !/^sk_(?:test|live)_/.test(stripeSecretKey)) {
    addError(errors, 'STRIPE_SECRET_KEY', 'Use a Stripe secret key beginning with sk_test_ or sk_live_.');
  }
  if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
    addError(errors, 'STRIPE_WEBHOOK_SECRET', 'Use the signing secret for the RiskRadar webhook endpoint.');
  }
  if (stripePriceId && !stripePriceId.startsWith('price_')) {
    addError(errors, 'STRIPE_PREMIUM_PRICE_ID', 'Use the recurring Stripe Price identifier beginning with price_.');
  }

  const paymentLink = parseUrl(stripePaymentLinkUrl);
  if (stripePaymentLinkUrl && (
    !paymentLink ||
    paymentLink.protocol !== 'https:' ||
    paymentLink.hostname !== 'buy.stripe.com'
  )) {
    addError(errors, 'STRIPE_PAYMENT_LINK_URL', 'Use the HTTPS RiskRadar Payment Link from buy.stripe.com.');
  }
  if (billingReferenceSecret && billingReferenceSecret.length < 32) {
    addError(errors, 'BILLING_REFERENCE_SECRET', 'Use at least 32 random characters for checkout binding.');
  }

  for (const [key, value] of [
    ['WEB_APP_URL', webAppUrl],
    ['EXPO_PUBLIC_WEB_APP_URL', publicWebAppUrl],
  ]) {
    const url = parseUrl(value);
    const localDevelopmentUrl = url?.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (value && (!url || (url.protocol !== 'https:' && !(localDevelopmentUrl && !production)))) {
      addError(errors, key, production
        ? 'Use the public HTTPS website origin in production.'
        : 'Use HTTPS, or localhost HTTP during local development.');
    }
  }
  if (webAppUrl && publicWebAppUrl && !sameUrl(webAppUrl, publicWebAppUrl)) {
    addError(errors, 'EXPO_PUBLIC_WEB_APP_URL', 'Use the same website origin as WEB_APP_URL.');
  }

  return {
    ready: errors.length === 0,
    errors,
  };
}

function runCli() {
  const result = checkMembershipReadiness(process.env);
  if (result.ready) {
    console.log('RiskRadar Premium configuration is ready.');
    return;
  }

  console.error('RiskRadar Premium configuration is incomplete:');
  for (const error of result.errors) {
    console.error(`- ${error.key}: ${error.message}`);
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runCli();
}
