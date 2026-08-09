import type { AccountEntitlement } from '../membership/types';
import { apiRequest } from './client';

export function getAccount(timeoutMs = 40_000, signal?: AbortSignal): Promise<AccountEntitlement> {
  return apiRequest<AccountEntitlement>('/api/account', { signal }, timeoutMs, 'required');
}

export function beginCheckout(): Promise<{ checkoutUrl: string }> {
  return apiRequest<{ checkoutUrl: string }>('/api/billing/checkout-reference', {
    method: 'POST',
  }, 40_000, 'required');
}

export function openCustomerPortal(returnUrl?: string): Promise<{ portalUrl: string }> {
  return apiRequest<{ portalUrl: string }>('/api/billing/customer-portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(returnUrl ? { returnUrl } : {}),
  }, 40_000, 'required');
}
