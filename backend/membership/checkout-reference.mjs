import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_REFERENCE_LIFETIME_MS = 15 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_LENGTH = 43;

function assertUuid(userId) {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Invalid checkout reference user ID.');
  }
}

function toDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }
  return date;
}

function createSignature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createCheckoutReference({ userId, expiresAt, issuedAt = new Date() }, secret) {
  assertUuid(userId);

  const issuedDate = toDate(issuedAt, 'issuedAt');
  const expiresDate = toDate(expiresAt, 'expiresAt');
  const lifetimeMs = expiresDate.getTime() - issuedDate.getTime();

  if (lifetimeMs <= 0) {
    throw new Error('Checkout references must expire in the future.');
  }

  if (lifetimeMs > MAX_REFERENCE_LIFETIME_MS) {
    throw new Error('Checkout references cannot last longer than 15 minutes.');
  }

  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(expiresDate.getTime() / 1000),
  })).toString('base64url');
  const signature = createSignature(payload, secret);

  return `v1_${payload}_${signature}`;
}

export function verifyCheckoutReference(reference, secret, now = new Date()) {
  if (typeof reference !== 'string' || !reference.startsWith('v1_')) {
    throw new Error('Invalid checkout reference.');
  }

  const body = reference.slice(3);
  if (body.length <= SIGNATURE_LENGTH + 1) {
    throw new Error('Invalid checkout reference.');
  }

  const separator = body.at(-(SIGNATURE_LENGTH + 1));
  if (separator !== '_') {
    throw new Error('Invalid checkout reference.');
  }

  const payload = body.slice(0, -(SIGNATURE_LENGTH + 1));
  const signature = body.slice(-SIGNATURE_LENGTH);
  const expectedSignature = createSignature(payload, secret);

  if (expectedSignature.length !== signature.length) {
    throw new Error('Invalid checkout reference.');
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid checkout reference.');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid checkout reference.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid checkout reference.');
  }

  const { sub, exp } = parsed;
  if (typeof sub !== 'string' || typeof exp !== 'number') {
    throw new Error('Invalid checkout reference.');
  }

  assertUuid(sub);

  const expiresAt = new Date(exp * 1000);
  const verifiedAt = toDate(now, 'now');
  const lifetimeMs = expiresAt.getTime() - verifiedAt.getTime();

  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error('Invalid checkout reference.');
  }

  if (verifiedAt.getTime() > expiresAt.getTime()) {
    throw new Error('Checkout reference expired.');
  }

  if (lifetimeMs > MAX_REFERENCE_LIFETIME_MS) {
    throw new Error('Invalid checkout reference.');
  }

  return {
    userId: sub,
    expiresAt: expiresAt.toISOString(),
  };
}
