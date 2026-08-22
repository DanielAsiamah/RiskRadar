import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FREE_DAILY_SEARCH_LIMIT,
  calendarDateKey,
  canUseFreeSearch,
  incrementDailySearchUsage,
  isValidEmailAddress,
  membershipReturnRoute,
  normalizePendingDestination,
  parseDailySearchUsage,
  shouldContinueBillingConfirmation,
} from './client-state.mjs';

import * as clientState from './client-state.mjs';

test('accepts a normal email address and rejects incomplete input', () => {
  assert.equal(isValidEmailAddress(' member@example.com '), true);
  assert.equal(isValidEmailAddress('member@'), false);
  assert.equal(isValidEmailAddress('member example.com'), false);
});

test('uses the visitor local calendar date for the daily allowance', () => {
  assert.equal(calendarDateKey(new Date(2026, 7, 5, 23, 59, 59)), '2026-08-05');
});

test('resets stale or invalid daily usage instead of carrying it forward', () => {
  const today = new Date(2026, 7, 5, 12, 0, 0);

  assert.deepEqual(
    parseDailySearchUsage('{"date":"2026-08-04","count":3}', today),
    { date: '2026-08-05', count: 0 },
  );
  assert.deepEqual(parseDailySearchUsage('not-json', today), { date: '2026-08-05', count: 0 });
});

test('routes a free visitor to pricing after three successful searches', () => {
  const usage = { date: '2026-08-05', count: FREE_DAILY_SEARCH_LIMIT };

  assert.equal(canUseFreeSearch(usage, false), false);
  assert.equal(canUseFreeSearch({ ...usage, count: FREE_DAILY_SEARCH_LIMIT - 1 }, false), true);
});

test('lets a backend-verified Premium member bypass the local product limit', () => {
  const usage = { date: '2026-08-05', count: 99 };

  assert.equal(canUseFreeSearch(usage, true), true);
});

test('keeps core search available when membership services are not configured', () => {
  const usage = { date: '2026-08-05', count: FREE_DAILY_SEARCH_LIMIT };

  assert.equal(canUseFreeSearch(usage, false, false), true);
});

test('does not attempt account authentication when Supabase is unavailable', () => {
  assert.equal(clientState.membershipEntryDecision?.(false, false), 'unavailable');
  assert.equal(clientState.membershipEntryDecision?.(true, false), 'sign-in');
  assert.equal(clientState.membershipEntryDecision?.(true, true), 'account');
});

test('counts only the successful search recorded for the current day', () => {
  const today = new Date(2026, 7, 5, 12, 0, 0);

  assert.deepEqual(
    incrementDailySearchUsage({ date: '2026-08-05', count: 2 }, today),
    { date: '2026-08-05', count: 3 },
  );
  assert.deepEqual(
    incrementDailySearchUsage({ date: '2026-08-04', count: 2 }, today),
    { date: '2026-08-05', count: 1 },
  );
});

test('restores only known Premium destinations from local storage', () => {
  assert.equal(normalizePendingDestination('WATCH_PLACE'), 'WATCH_PLACE');
  assert.equal(normalizePendingDestination('ADMIN'), null);
  assert.equal(normalizePendingDestination(null), null);
});

test('stops checkout confirmation after twenty seconds or successful activation', () => {
  assert.equal(shouldContinueBillingConfirmation(1_000, 20_999, false), true);
  assert.equal(shouldContinueBillingConfirmation(1_000, 21_000, false), false);
  assert.equal(shouldContinueBillingConfirmation(1_000, 5_000, true), false);
});

test('recognises billing and account return URLs without trusting other parameters', () => {
  assert.equal(membershipReturnRoute('https://riskradar.example/?billing=success'), 'BILLING_SUCCESS');
  assert.equal(membershipReturnRoute('https://riskradar.example/?account=1'), 'ACCOUNT');
  assert.equal(membershipReturnRoute('not a URL'), null);
  assert.equal(membershipReturnRoute(null), null);
});

test('blocks search submission until persisted daily usage is hydrated', () => {
  assert.equal(clientState.searchSubmissionDecision?.(false, 'SW1A 1AA'), 'hydrating');
  assert.equal(clientState.searchSubmissionDecision?.(true, ''), 'empty');
  assert.equal(clientState.searchSubmissionDecision?.(true, 'SW1A 1AA'), 'ready');
});

test('aborts and suppresses every account request older than the latest request', () => {
  const requests = clientState.createLatestRequestCoordinator?.();
  assert.ok(requests, 'expected an account request coordinator');

  const first = requests.begin();
  const second = requests.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);

  requests.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(second.isCurrent(), false);
});

test('caps checkout polling to the absolute deadline and never starts at the deadline', () => {
  assert.deepEqual(
    clientState.billingPollDecision?.(21_000, 20_750, false),
    { status: 'continue', requestTimeoutMs: 250, nextDelayMs: 250 },
  );
  assert.deepEqual(clientState.billingPollDecision?.(21_000, 21_000, false), { status: 'deadline' });
  assert.deepEqual(clientState.billingPollDecision?.(21_000, 5_000, true), { status: 'premium' });
});

test('presents a failed initial account lookup as unavailable rather than free', () => {
  assert.equal(clientState.accountViewState?.(null, false, false), 'unavailable');
  assert.equal(clientState.accountViewState?.(null, true, false), 'loading');
  assert.equal(clientState.accountViewState?.(null, false, true), 'confirming');
  assert.equal(clientState.accountViewState?.({ status: 'free' }, false, false), 'account');
});

test('pricing Back clears a persisted Premium destination before returning Home', () => {
  assert.deepEqual(
    clientState.pricingBackDecision?.('DASHBOARD'),
    { clearPendingDestination: true, nextState: 'HOME' },
  );
  assert.deepEqual(
    clientState.pricingBackDecision?.(null),
    { clearPendingDestination: false, nextState: 'HOME' },
  );
});

test('selects the web callback on web and the Expo deep link on native', () => {
  const webRedirect = 'https://riskradar.example/?auth=callback';
  const nativeRedirect = 'riskradar://auth/callback';

  assert.equal(clientState.selectAuthRedirectUrl?.('web', webRedirect, nativeRedirect), webRedirect);
  assert.equal(clientState.selectAuthRedirectUrl?.('ios', webRedirect, nativeRedirect), nativeRedirect);
  assert.equal(clientState.selectAuthRedirectUrl?.('android', webRedirect, nativeRedirect), nativeRedirect);
});

test('keeps resend errors visible in the sent-link state', () => {
  assert.equal(clientState.visibleMagicLinkError?.('member@example.com', 'Please retry.'), 'Please retry.');
  assert.equal(clientState.visibleMagicLinkError?.('member@example.com', null), null);
});
