import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckoutReference, verifyCheckoutReference } from './checkout-reference.mjs';

const secret = '0123456789abcdef0123456789abcdef';
const userId = '123e4567-e89b-12d3-a456-426614174000';
const issuedAt = new Date('2026-08-05T12:00:00.000Z');

test('creates and verifies a valid checkout reference', () => {
  const expiresAt = new Date('2026-08-05T12:10:00.000Z');
  const reference = createCheckoutReference({ userId, expiresAt, issuedAt }, secret);

  assert.match(reference, /^v1_[A-Za-z0-9_-]+_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(verifyCheckoutReference(reference, secret, issuedAt), {
    userId,
    expiresAt: expiresAt.toISOString(),
  });
});

test('rejects a tampered reference', () => {
  const reference = createCheckoutReference(
    { userId, expiresAt: new Date('2026-08-05T12:10:00.000Z'), issuedAt },
    secret,
  );
  const tampered = `${reference.slice(0, -1)}A`;

  assert.throws(() => verifyCheckoutReference(tampered, secret, issuedAt), /invalid/i);
});

test('rejects an expired reference', () => {
  const reference = createCheckoutReference(
    { userId, expiresAt: new Date('2026-08-05T12:10:00.000Z'), issuedAt },
    secret,
  );

  assert.throws(
    () => verifyCheckoutReference(reference, secret, new Date('2026-08-05T12:10:01.000Z')),
    /expired/i,
  );
});

test('rejects malformed payloads', () => {
  assert.throws(() => verifyCheckoutReference('v1_bad_payload_bad_signature', secret, issuedAt), /invalid/i);
});

test('rejects verification with the wrong secret', () => {
  const reference = createCheckoutReference(
    { userId, expiresAt: new Date('2026-08-05T12:10:00.000Z'), issuedAt },
    secret,
  );

  assert.throws(() => verifyCheckoutReference(reference, 'different-secret-value', issuedAt), /invalid/i);
});

test('rejects references longer than fifteen minutes', () => {
  assert.throws(
    () =>
      createCheckoutReference(
        { userId, expiresAt: new Date('2026-08-05T12:16:00.000Z'), issuedAt },
        secret,
      ),
    /15 minutes/i,
  );
});
