export const FREE_MONTHLY_CHECK_LIMIT = 3;
export const PRO_PRICE_GBP_MONTHLY = 15;
export const CONTACT_EMAIL = 'supr3ltd@gmail.com';
export const SAFETY_SESSION_PURPOSES = Object.freeze([
  'marketplace',
  'travel',
  'holiday',
  'date',
  'work',
  'other',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getUsageMonthKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return getUsageMonthKey(new Date());
  return value.toISOString().slice(0, 7);
}

export function buildUsageStatus({ used = 0, monthKey = getUsageMonthKey(), entitlement = 'free' } = {}) {
  const normalizedEntitlement = entitlement === 'pro' ? 'pro' : 'free';
  const normalizedUsed = Math.max(0, Math.floor(Number(used) || 0));

  if (normalizedEntitlement === 'pro') {
    return {
      entitlement: 'pro',
      monthKey,
      used: normalizedUsed,
      limit: null,
      remaining: null,
      canSearch: true,
    };
  }

  const remaining = Math.max(0, FREE_MONTHLY_CHECK_LIMIT - normalizedUsed);
  return {
    entitlement: 'free',
    monthKey,
    used: normalizedUsed,
    limit: FREE_MONTHLY_CHECK_LIMIT,
    remaining,
    canSearch: remaining > 0,
  };
}

export function validateSafetySessionInput(input = {}, now = new Date()) {
  const errors = [];
  const destination = String(input.destination || '').trim();
  const purpose = String(input.purpose || '').trim().toLowerCase();
  const meetingContact = String(input.meetingContact || '').trim();
  const trustedEmail = String(input.trustedEmail || '').trim().toLowerCase();
  const notes = String(input.notes || '').trim();
  const expectedEndAt = String(input.expectedEndAt || '').trim();
  const expectedEndDate = new Date(expectedEndAt);
  const nowDate = now instanceof Date ? now : new Date(now);

  if (!destination) errors.push('Destination is required.');
  if (!SAFETY_SESSION_PURPOSES.includes(purpose)) {
    errors.push(`Purpose must be one of ${SAFETY_SESSION_PURPOSES.join(', ')}.`);
  }
  if (!trustedEmail || !EMAIL_PATTERN.test(trustedEmail)) {
    errors.push('Trusted contact email must be a valid email address.');
  }
  if (!expectedEndAt || Number.isNaN(expectedEndDate.getTime()) || expectedEndDate <= nowDate) {
    errors.push('Expected end time must be in the future.');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      destination,
      purpose,
      meetingContact,
      trustedEmail,
      expectedEndAt: expectedEndDate.toISOString(),
      notes,
    },
  };
}
