function toIsoString(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }

  return new Date(value).toISOString();
}

function normalizeStatus(status, cancelAtPeriodEnd) {
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) {
    return 'canceling';
  }

  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceling':
    case 'expired':
    case 'free':
    case 'unavailable':
      return status;
    case 'unpaid':
    case 'incomplete_expired':
    case 'canceled':
      return 'expired';
    default:
      return 'free';
  }
}

export function toEntitlement(subscription, configured) {
  if (!configured) {
    return {
      configured: false,
      authenticated: false,
      email: null,
      status: 'unavailable',
      premium: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canManageBilling: false,
    };
  }

  if (!subscription) {
    return {
      configured: true,
      authenticated: false,
      email: null,
      status: 'free',
      premium: false,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canManageBilling: false,
    };
  }

  const status = normalizeStatus(subscription.status, subscription.cancel_at_period_end);
  const premium = status === 'active' || status === 'trialing' || status === 'canceling';

  return {
    configured: true,
    authenticated: true,
    email: subscription.email ?? null,
    status,
    premium,
    currentPeriodEnd: subscription.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    canManageBilling: Boolean(subscription.stripe_customer_id),
  };
}

export function shouldApplyStripeEvent(currentCreatedAt, incomingCreatedAt) {
  if (!incomingCreatedAt) {
    return false;
  }

  if (!currentCreatedAt) {
    return true;
  }

  return new Date(incomingCreatedAt).getTime() >= new Date(currentCreatedAt).getTime();
}

export function normalizeStripeSubscription(subscription, userId, eventCreatedAt) {
  const item = subscription?.items?.data?.[0];

  return {
    user_id: userId,
    stripe_customer_id: subscription.customer ?? null,
    stripe_subscription_id: subscription.id ?? null,
    stripe_price_id: item?.price?.id ?? null,
    status: subscription.status ?? 'free',
    current_period_end: toIsoString(subscription.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    last_event_created_at: toIsoString(eventCreatedAt),
  };
}
