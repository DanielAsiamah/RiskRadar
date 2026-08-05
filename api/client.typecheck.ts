import { apiRequest, ApiError } from './client';
import { beginCheckout, getAccount, openCustomerPortal } from './membership';

export async function assertMembershipApiContracts() {
  const _account = await getAccount();
  const _checkout = await beginCheckout();
  const _portal = await openCustomerPortal();
  const _raw = await apiRequest<{ ok: boolean }>('/api/account', {}, 1_000, 'optional');

  return {
    _account,
    _checkout,
    _portal,
    _raw,
    _error: new ApiError('oops', 500, 'AUTH_REQUIRED'),
  };
}
