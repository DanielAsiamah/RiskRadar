const REQUIRED_FIELDS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PREMIUM_PRICE_ID',
  'STRIPE_PAYMENT_LINK_URL',
  'BILLING_REFERENCE_SECRET',
  'WEB_APP_URL',
];

function readString(env, key) {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function parseUrl(value, { allowLocalhost = false } = {}) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol === 'https:') {
      return url;
    }
    if (allowLocalhost && url.protocol === 'http:' && url.hostname === 'localhost') {
      return url;
    }
  } catch {
    return null;
  }

  return null;
}

export function readMembershipConfig(env) {
  const supabaseUrl = readString(env, 'SUPABASE_URL');
  const supabaseServiceRoleKey = readString(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = readString(env, 'STRIPE_SECRET_KEY');
  const stripeWebhookSecret = readString(env, 'STRIPE_WEBHOOK_SECRET');
  const stripePremiumPriceId = readString(env, 'STRIPE_PREMIUM_PRICE_ID');
  const stripePaymentLinkUrl = readString(env, 'STRIPE_PAYMENT_LINK_URL');
  const billingReferenceSecret = readString(env, 'BILLING_REFERENCE_SECRET');
  const webAppUrl = readString(env, 'WEB_APP_URL');

  const configured = REQUIRED_FIELDS.every((field) => readString(env, field)) &&
    Boolean(parseUrl(supabaseUrl)) &&
    Boolean(parseUrl(stripePaymentLinkUrl)) &&
    Boolean(parseUrl(webAppUrl, { allowLocalhost: true }));

  return {
    configured,
    supabaseUrl,
    supabaseServiceRoleKey,
    stripeSecretKey,
    stripeWebhookSecret,
    stripePremiumPriceId,
    stripePaymentLinkUrl,
    billingReferenceSecret,
    webAppUrl,
  };
}

export function toPublicMembershipConfig(config) {
  const paymentLinkHost = parseUrl(config.stripePaymentLinkUrl)?.host ?? null;

  return {
    configured: config.configured,
    paymentLinkHost,
  };
}
