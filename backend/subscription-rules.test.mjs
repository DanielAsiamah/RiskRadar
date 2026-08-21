import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_DAILY_CHECK_LIMIT,
  PRO_PRICE_GBP_MONTHLY,
  buildUsageStatus,
  getUsageDateKey,
  validateSafetySessionInput,
} from './subscription-rules.mjs';

test('free usage status allows exactly three checks per calendar day', () => {
  assert.equal(FREE_DAILY_CHECK_LIMIT, 3);
  assert.deepEqual(
    buildUsageStatus({ used: 2, dateKey: '2026-08-09', entitlement: 'free' }),
    { entitlement: 'free', dateKey: '2026-08-09', used: 2, limit: 3, remaining: 1, canSearch: true },
  );
  assert.deepEqual(
    buildUsageStatus({ used: 3, dateKey: '2026-08-09', entitlement: 'free' }),
    { entitlement: 'free', dateKey: '2026-08-09', used: 3, limit: 3, remaining: 0, canSearch: false },
  );
});

test('premium product price is GBP 15 per month', () => {
  assert.equal(PRO_PRICE_GBP_MONTHLY, 15);
});

test('pro usage status has unlimited checks', () => {
  assert.deepEqual(
    buildUsageStatus({ used: 99, dateKey: '2026-08-09', entitlement: 'pro' }),
    { entitlement: 'pro', dateKey: '2026-08-09', used: 99, limit: null, remaining: null, canSearch: true },
  );
});

test('usage date key is derived in yyyy-mm-dd form', () => {
  assert.equal(getUsageDateKey(new Date('2026-08-09T23:30:00.000Z')), '2026-08-09');
});

test('validates the observable Safety Session contract', () => {
  const now = new Date('2026-08-02T10:00:00.000Z');
  const result = validateSafetySessionInput({
    destination: 'SW1A 1AA',
    purpose: 'marketplace',
    meetingContact: 'Facebook Marketplace seller',
    trustedEmail: 'friend@example.com',
    expectedEndAt: '2026-08-02T11:30:00.000Z',
    notes: 'Meet outside the station.',
  }, now);

  assert.equal(result.ok, true);
  assert.equal(result.value.destination, 'SW1A 1AA');
  assert.equal(result.value.purpose, 'marketplace');
  assert.equal(result.value.trustedEmail, 'friend@example.com');
});

test('rejects invalid Safety Sessions before storage', () => {
  const now = new Date('2026-08-02T10:00:00.000Z');
  const result = validateSafetySessionInput({
    destination: '',
    purpose: 'unknown',
    trustedEmail: 'not-an-email',
    expectedEndAt: '2026-08-02T09:59:00.000Z',
  }, now);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'Destination is required.',
    'Purpose must be one of marketplace, travel, holiday, date, work, other.',
    'Trusted contact email must be a valid email address.',
    'Expected end time must be in the future.',
  ]);
});
