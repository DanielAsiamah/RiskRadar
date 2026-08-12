export class MembershipStoreError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MembershipStoreError';
    this.status = status;
  }
}

function createHeaders(serviceRoleKey, extraHeaders = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders,
  };
}

function encodeFilter(value) {
  return encodeURIComponent(`eq.${value}`);
}

async function parseJson(response) {
  const body = await response.json().catch(() => null);
  return body;
}

function mapAlertPreferences(row) {
  if (!row) {
    return null;
  }

  return {
    monthlyEmailEnabled: Boolean(row.monthly_email_enabled),
    categoryChangeEnabled: Boolean(row.category_change_enabled),
    volumeChangeEnabled: Boolean(row.volume_change_enabled),
    updatedAt: row.updated_at ?? null,
  };
}

export function createSupabaseMembershipStore(config, fetchImpl = fetch) {
  async function request(path, options = {}) {
    const response = await fetchImpl(`${config.supabaseUrl}${path}`, options);

    if (!response.ok) {
      const body = await parseJson(response);
      throw new MembershipStoreError(
        body?.message || body?.error || 'Supabase membership request failed.',
        response.status,
      );
    }

    return parseJson(response);
  }

  async function getSingle(path) {
    const rows = await request(path, {
      method: 'GET',
      headers: createHeaders(config.supabaseServiceRoleKey),
    });

    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }

  return {
    async verifyAccessToken(token) {
      return request('/auth/v1/user', {
        method: 'GET',
        headers: {
          apikey: config.supabaseServiceRoleKey,
          Authorization: `Bearer ${token}`,
        },
      });
    },

    async getSubscription(userId) {
      return getSingle(`/rest/v1/subscriptions?user_id=${encodeFilter(userId)}&limit=1`);
    },

    async getSubscriptionByStripeCustomer(customerId) {
      return getSingle(
        `/rest/v1/subscriptions?stripe_customer_id=${encodeFilter(customerId)}&limit=1`,
      );
    },

    async getSubscriptionByStripeSubscription(subscriptionId) {
      return getSingle(
        `/rest/v1/subscriptions?stripe_subscription_id=${encodeFilter(subscriptionId)}&limit=1`,
      );
    },

    async upsertSubscription(row) {
      await request('/rest/v1/subscriptions', {
        method: 'POST',
        headers: createHeaders(config.supabaseServiceRoleKey, {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        }),
        body: JSON.stringify(row),
      });
    },

    async claimBillingEvent(event) {
      try {
        await request('/rest/v1/billing_events', {
          method: 'POST',
          headers: createHeaders(config.supabaseServiceRoleKey, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            ...event,
            processing_result: event.processing_result ?? 'accepted',
          }),
        });
        return true;
      } catch (error) {
        if (error instanceof MembershipStoreError && error.status === 409) {
          return false;
        }
        throw error;
      }
    },

    async getAlertPreferences(userId) {
      const row = await getSingle(`/rest/v1/alert_preferences?user_id=${encodeFilter(userId)}&limit=1`);
      return mapAlertPreferences(row);
    },

    async upsertAlertPreferences(userId, input) {
      const rows = await request('/rest/v1/alert_preferences', {
        method: 'POST',
        headers: createHeaders(config.supabaseServiceRoleKey, {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify({
          user_id: userId,
          monthly_email_enabled: Boolean(input?.monthlyEmailEnabled),
          category_change_enabled: Boolean(input?.categoryChangeEnabled),
          volume_change_enabled: Boolean(input?.volumeChangeEnabled),
        }),
      });

      const row = Array.isArray(rows) ? rows[0] ?? null : rows;
      return mapAlertPreferences(row);
    },
  };
}
