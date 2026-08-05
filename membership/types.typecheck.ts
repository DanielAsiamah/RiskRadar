import type { AccountEntitlement } from './types';

export const freeAccountFixture: AccountEntitlement = {
  configured: true,
  authenticated: true,
  email: 'member@example.com',
  status: 'free',
  premium: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
};
