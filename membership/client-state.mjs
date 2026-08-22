export const FREE_DAILY_SEARCH_LIMIT = 3;
export const BILLING_CONFIRMATION_WINDOW_MS = 20_000;

const PREMIUM_DESTINATIONS = new Set([
  'DASHBOARD',
  'WATCH_PLACE',
  'COMPARE',
  'REPORTS',
]);

export function calendarDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDailySearchUsage(raw, now = new Date()) {
  const today = calendarDateKey(now);

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const count = Number(parsed?.count);
    if (parsed?.date !== today || !Number.isInteger(count) || count < 0) {
      return { date: today, count: 0 };
    }

    return { date: today, count };
  } catch {
    return { date: today, count: 0 };
  }
}

export function incrementDailySearchUsage(usage, now = new Date()) {
  const current = parseDailySearchUsage(usage, now);
  return { ...current, count: current.count + 1 };
}

export function canUseFreeSearch(usage, premium, membershipAvailable = true) {
  return Boolean(premium) || !membershipAvailable || usage.count < FREE_DAILY_SEARCH_LIMIT;
}

export function membershipEntryDecision(authConfigured, authenticated) {
  if (!authConfigured) return 'unavailable';
  return authenticated ? 'account' : 'sign-in';
}

export function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function membershipReturnRoute(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    if (url.searchParams.get('billing') === 'success') return 'BILLING_SUCCESS';
    if (url.searchParams.get('account') === '1') return 'ACCOUNT';
    return null;
  } catch {
    return null;
  }
}

export function normalizePendingDestination(value) {
  return typeof value === 'string' && PREMIUM_DESTINATIONS.has(value) ? value : null;
}

export function shouldContinueBillingConfirmation(startedAtMs, nowMs, premium) {
  return !premium && nowMs - startedAtMs < BILLING_CONFIRMATION_WINDOW_MS;
}

export function searchSubmissionDecision(hydrated, value) {
  if (!hydrated) return 'hydrating';
  return String(value).trim() ? 'ready' : 'empty';
}

export function createLatestRequestCoordinator() {
  let generation = 0;
  let controller = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const requestGeneration = ++generation;
      const requestController = controller;

      return {
        signal: requestController.signal,
        isCurrent: () => requestGeneration === generation && !requestController.signal.aborted,
      };
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export function billingPollDecision(deadlineAtMs, nowMs, premium) {
  if (premium) return { status: 'premium' };

  const remainingMs = deadlineAtMs - nowMs;
  if (remainingMs <= 0) return { status: 'deadline' };

  return {
    status: 'continue',
    requestTimeoutMs: Math.min(5_000, remainingMs),
    nextDelayMs: Math.min(2_000, remainingMs),
  };
}

export function accountViewState(account, loading, confirming) {
  if (confirming) return 'confirming';
  if (loading && !account) return 'loading';
  if (!account || account.status === 'unavailable') return 'unavailable';
  return 'account';
}

export function pricingBackDecision(pendingDestination) {
  return {
    clearPendingDestination: Boolean(pendingDestination),
    nextState: 'HOME',
  };
}

export function selectAuthRedirectUrl(platform, webRedirectUrl, nativeRedirectUrl) {
  return platform === 'web' ? webRedirectUrl : nativeRedirectUrl;
}

export function visibleMagicLinkError(sentTo, error) {
  return sentTo && error ? error : null;
}
