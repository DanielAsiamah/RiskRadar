export class RouteGuardAccessError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'RouteGuardAccessError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function unavailable() {
  return new RouteGuardAccessError('Route Guard membership verification is unavailable. Please retry later.', 503, 'ROUTE_GUARD_AUTH_UNAVAILABLE');
}

function authenticationRequired() {
  return new RouteGuardAccessError('Sign in to use Route Guard.', 401, 'AUTHENTICATION_REQUIRED');
}

export function createRouteGuardAccess({
  env = {}, host = '', port = 3001, config = {}, store, now = Date.now, timeoutMs = 8000,
} = {}) {
  const localEnabled = env.NODE_ENV === 'development'
    && env.ROUTE_GUARD_LOCAL_DEVELOPMENT === 'true'
    && ['127.0.0.1', '::1'].includes(host);
  const suffix = Number(port) === 80 ? '' : `:${port}`;
  const localHosts = new Set([`localhost${suffix}`, `127.0.0.1${suffix}`, `[::1]${suffix}`]);

  function isLocalRequest(request) {
    if (!localEnabled) return false;
    const headers = request?.headers ?? {};
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request?.socket?.remoteAddress)) return false;
    if (!localHosts.has(headers.host)) return false;
    // Development access is never intended for a tunnel or reverse proxy.
    if (Object.keys(headers).some((key) => key === 'forwarded' || key.startsWith('x-forwarded-'))) return false;
    if (headers['sec-fetch-site'] && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return false;
    return headers.origin === undefined || headers.origin === `http://${headers.host}`;
  }

  async function verifyMembership(request) {
    const authorization = request?.headers?.authorization;
    const token = typeof authorization === 'string' ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : null;
    if (!token) throw authenticationRequired();
    let user;
    try {
      user = await store.verifyAccessToken(token);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) throw authenticationRequired();
      throw unavailable();
    }
    if (typeof user?.id !== 'string' || !user.id) throw authenticationRequired();
    const subscription = await store.getSubscription(user.id);
    const periodEnd = typeof subscription?.current_period_end === 'string'
      ? Date.parse(subscription.current_period_end) : NaN;
    if (subscription?.user_id !== user.id
      || !['active', 'trialing', 'canceling'].includes(subscription?.status)
      || !Number.isFinite(periodEnd) || periodEnd <= now()) {
      throw new RouteGuardAccessError('An active RiskRadar PRO subscription is required for Route Guard.', 403, 'PREMIUM_REQUIRED');
    }
    return { mode: 'subscription', userId: user.id };
  }

  return {
    describe(request) {
      return { localDevelopment: isLocalRequest(request), subscriptionConfigured: config.configured === true };
    },
    async authorize(request) {
      if (isLocalRequest(request)) return { mode: 'local-development' };
      if (config.configured !== true) throw unavailable();
      let timer;
      try {
        return await Promise.race([
          verifyMembership(request),
          new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); }),
        ]);
      } catch (error) {
        if (error instanceof RouteGuardAccessError) throw error;
        throw unavailable();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
