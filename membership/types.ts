export type MembershipStatus =
  | 'free'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceling'
  | 'expired'
  | 'unavailable';

export type PremiumDestination =
  | 'DASHBOARD'
  | 'WATCH_PLACE'
  | 'COMPARE'
  | 'REPORTS';

export type MembershipApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'PREMIUM_REQUIRED'
  | 'BILLING_UNAVAILABLE'
  | 'INVALID_CHECKOUT_REFERENCE';

export interface AccountEntitlement {
  configured: boolean;
  authenticated: boolean;
  email: string | null;
  status: MembershipStatus;
  premium: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
}
