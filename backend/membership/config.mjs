const REQUIRED_FIELDS = [
  'SUPABASE_URL',
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

function isPlaceholder(value) {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('your-project') ||
    normalized.includes('your-frontend') ||
    normalized.includes('your-backend') ||
    normalized.includes('replace-me') ||
    normalized.includes('change-me') ||
    normalized.includes('<') ||
    normalized.includes('>');
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
    if (
      allowLocalhost &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    ) {
      return url;
    }
  } catch {
    return null;
  }

  return null;
}

function readLegacyJwtRole(value) {
  if (!value.startsWith('eyJ')) {
    return null;
  }

  try {
    const payload = value.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

function isSupabaseAdminKey(value) {
  return value.startsWith('sb_secret_') || readLegacyJwtRole(value) === 'service_role';
}

export function readMembershipConfig(env) {
  const supabaseUrl = readString(env, 'SUPABASE_URL');
  const supabaseAdminKey = readString(env, 'SUPABASE_SECRET_KEY') ||
    readString(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = readString(env, 'STRIPE_SECRET_KEY');
  const stripeWebhookSecret = readString(env, 'STRIPE_WEBHOOK_SECRET');
  const stripePremiumPriceId = readString(env, 'STRIPE_PREMIUM_PRICE_ID');
  const stripePaymentLinkUrl = readString(env, 'STRIPE_PAYMENT_LINK_URL');
  const billingReferenceSecret = readString(env, 'BILLING_REFERENCE_SECRET');
  const webAppUrl = readString(env, 'WEB_APP_URL');
  const configuredValues = [
    supabaseUrl,
    supabaseAdminKey,
    stripeSecretKey,
    stripeWebhookSecret,
    stripePremiumPriceId,
    stripePaymentLinkUrl,
    billingReferenceSecret,
    webAppUrl,
  ];

  const paymentLinkUrl = parseUrl(stripePaymentLinkUrl);
  const configured = isSupabaseAdminKey(supabaseAdminKey) &&
    REQUIRED_FIELDS.every((field) => readString(env, field)) &&
    configuredValues.every((value) => !isPlaceholder(value)) &&
    Boolean(parseUrl(supabaseUrl)) &&
    paymentLinkUrl?.hostname === 'buy.stripe.com' &&
    Boolean(parseUrl(webAppUrl, { allowLocalhost: true })) &&
    /^sk_(?:test|live)_/.test(stripeSecretKey) &&
    stripeWebhookSecret.startsWith('whsec_') &&
    stripePremiumPriceId.startsWith('price_') &&
    billingReferenceSecret.length >= 32;

  return {
    configured,
    supabaseUrl,
    supabaseAdminKey,
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
