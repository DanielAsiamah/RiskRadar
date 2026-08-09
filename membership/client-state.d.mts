import type { PremiumDestination } from './types';

export interface DailySearchUsage {
  date: string;
  count: number;
}

export const FREE_DAILY_SEARCH_LIMIT: 3;
export const BILLING_CONFIRMATION_WINDOW_MS: 20000;

export function calendarDateKey(date?: Date): string;
export function parseDailySearchUsage(raw: string | DailySearchUsage | null, now?: Date): DailySearchUsage;
export function incrementDailySearchUsage(usage: DailySearchUsage, now?: Date): DailySearchUsage;
export function canUseFreeSearch(usage: DailySearchUsage, premium: boolean): boolean;
export function isValidEmailAddress(value: string): boolean;
export function membershipReturnRoute(value: string | null): 'BILLING_SUCCESS' | 'ACCOUNT' | null;
export function normalizePendingDestination(value: string | null): PremiumDestination | null;
export function shouldContinueBillingConfirmation(startedAtMs: number, nowMs: number, premium: boolean): boolean;
export type SearchSubmissionDecision = 'hydrating' | 'empty' | 'ready';
export function searchSubmissionDecision(hydrated: boolean, value: string): SearchSubmissionDecision;
export interface LatestRequestHandle {
  signal: AbortSignal;
  isCurrent(): boolean;
}
export interface LatestRequestCoordinator {
  begin(): LatestRequestHandle;
  cancel(): void;
}
export function createLatestRequestCoordinator(): LatestRequestCoordinator;
export type BillingPollDecision =
  | { status: 'premium' }
  | { status: 'deadline' }
  | { status: 'continue'; requestTimeoutMs: number; nextDelayMs: number };
export function billingPollDecision(deadlineAtMs: number, nowMs: number, premium: boolean): BillingPollDecision;
export type AccountViewState = 'loading' | 'confirming' | 'unavailable' | 'account';
export function accountViewState(
  account: { status: string } | null,
  loading: boolean,
  confirming: boolean,
): AccountViewState;
export function pricingBackDecision(pendingDestination: PremiumDestination | null): {
  clearPendingDestination: boolean;
  nextState: 'HOME';
};
export function selectAuthRedirectUrl(
  platform: string,
  webRedirectUrl: string,
  nativeRedirectUrl: string,
): string;
export function visibleMagicLinkError(sentTo: string | null, error: string | null): string | null;
