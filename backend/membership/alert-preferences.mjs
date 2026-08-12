const DEFAULT_ALERT_PREFERENCES = Object.freeze({
  monthlyEmailEnabled: true,
  categoryChangeEnabled: true,
  volumeChangeEnabled: true,
});

class AlertPreferencesError extends Error {
  constructor(message, statusCode = 400, code = 'INVALID_ALERT_PREFERENCES') {
    super(message);
    this.name = 'AlertPreferencesError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function validateAlertPreferences(input) {
  const monthlyEmailEnabled = input?.monthlyEmailEnabled;
  const categoryChangeEnabled = input?.categoryChangeEnabled;
  const volumeChangeEnabled = input?.volumeChangeEnabled;

  if (
    typeof monthlyEmailEnabled !== 'boolean' ||
    typeof categoryChangeEnabled !== 'boolean' ||
    typeof volumeChangeEnabled !== 'boolean'
  ) {
    throw new AlertPreferencesError(
      'Alert preferences must include Boolean values for monthlyEmailEnabled, categoryChangeEnabled, and volumeChangeEnabled.',
    );
  }

  return {
    monthlyEmailEnabled,
    categoryChangeEnabled,
    volumeChangeEnabled,
  };
}

function toPublicAlertPreferences(user, preferences) {
  return {
    email: user.email ?? null,
    monthlyEmailEnabled: Boolean(preferences?.monthlyEmailEnabled),
    categoryChangeEnabled: Boolean(preferences?.categoryChangeEnabled),
    volumeChangeEnabled: Boolean(preferences?.volumeChangeEnabled),
    updatedAt: preferences?.updatedAt ?? null,
  };
}

function mapAlertPreferencesError(error) {
  if (error instanceof AlertPreferencesError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: error.message,
        code: error.code,
      },
    };
  }

  return {
    statusCode: Number(error?.status) || 500,
    payload: {
      error: error?.message || 'Unexpected alert preferences error.',
      code: error?.code || null,
    },
  };
}

export function createAlertPreferencesRouteHandler({ store }) {
  return {
    async handle(request, response, url, context) {
      if (
        url.pathname !== '/api/alert-preferences' ||
        !store ||
        typeof store.getAlertPreferences !== 'function' ||
        typeof store.upsertAlertPreferences !== 'function'
      ) {
        return false;
      }

      const isGet = request.method === 'GET';
      const isPut = request.method === 'PUT';
      if (!isGet && !isPut) {
        return false;
      }

      const premium = await context.requirePremium(request);
      if (premium.error) {
        context.sendJson(response, premium.error.statusCode, premium.error.payload);
        return true;
      }

      try {
        if (isGet) {
          let preferences = await store.getAlertPreferences(premium.user.userId);
          if (!preferences) {
            preferences = await store.upsertAlertPreferences(
              premium.user.userId,
              DEFAULT_ALERT_PREFERENCES,
            );
          }

          context.sendJson(
            response,
            200,
            toPublicAlertPreferences(premium.user, preferences),
          );
          return true;
        }

        const body = await context.readJsonBody(request);
        const preferences = await store.upsertAlertPreferences(
          premium.user.userId,
          validateAlertPreferences(body),
        );

        context.sendJson(
          response,
          200,
          toPublicAlertPreferences(premium.user, preferences),
        );
        return true;
      } catch (error) {
        const mapped = mapAlertPreferencesError(error);
        context.sendJson(response, mapped.statusCode, mapped.payload);
        return true;
      }
    },
  };
}
