import React from 'react';

import type { AccountEntitlement } from '../membership/types';
import Account from './Account';
import MembershipUnavailable from './MembershipUnavailable';
import Pricing from './Pricing';
import SignIn from './SignIn';

const freeAccount: AccountEntitlement = {
  configured: true,
  authenticated: true,
  email: 'member@example.com',
  status: 'free',
  premium: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
};

export const signInFixture = React.createElement(SignIn, {
  onSubmit: async (_email: string) => undefined,
  onBack: () => undefined,
  onContinueFree: () => undefined,
});

export const pricingFixture = React.createElement(Pricing, {
  authenticated: true,
  busy: false,
  error: null,
  onBack: () => undefined,
  onCheckout: async () => undefined,
  onOpenRouteGuard: () => undefined,
  onOpenSafetySession: () => undefined,
});

export const accountFixture = React.createElement(Account, {
  account: freeAccount,
  loading: false,
  confirming: false,
  error: null,
  onBack: () => undefined,
  onRefresh: async () => undefined,
  onManageBilling: async () => undefined,
  onRestoreMembership: () => undefined,
  onSignOut: async () => undefined,
});

export const unavailableFixture = React.createElement(MembershipUnavailable, {
  onBack: () => undefined,
  onRetry: async () => undefined,
});
