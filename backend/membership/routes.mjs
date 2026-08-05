import { toEntitlement } from './subscription-state.mjs';

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function readBearerToken(request) {
  const authorization = request.headers.authorization || request.headers.Authorization;
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function readRawBody(request, maxBytes = 256 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes) {
      throw new Error('Request body exceeded the allowed size.');
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);
  if (!rawBody.length) {
    return {};
  }

  return JSON.parse(rawBody.toString('utf8'));
}

export function createMembershipRouteHandler({ config, store, billing }) {
  async function authenticate(request) {
    const token = readBearerToken(request);
    if (!token) {
      return {
        error: {
          statusCode: 401,
          payload: {
            error: 'A valid member session is required.',
            code: 'AUTH_REQUIRED',
          },
        },
      };
    }

    try {
      const user = await store.verifyAccessToken(token);
      return {
        user: {
          userId: user.id,
          email: user.email ?? null,
        },
      };
    } catch {
      return {
        error: {
          statusCode: 401,
          payload: {
            error: 'A valid member session is required.',
            code: 'AUTH_REQUIRED',
          },
        },
      };
    }
  }

  return {
    async handle(request, response, url) {
      if (request.method === 'GET' && url.pathname === '/api/account') {
        if (!config.configured) {
          sendJson(response, 200, toEntitlement(null, false));
          return true;
        }

        const auth = await authenticate(request);
        if (auth.error) {
          sendJson(response, auth.error.statusCode, auth.error.payload);
          return true;
        }

        const subscription = await store.getSubscription(auth.user.userId);
        sendJson(response, 200, toEntitlement({
          ...subscription,
          email: auth.user.email,
        }, true));
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/billing/checkout-reference') {
        if (!config.configured) {
          sendJson(response, 503, {
            error: 'Premium billing is not configured on this deployment yet.',
            code: 'BILLING_UNAVAILABLE',
          });
          return true;
        }

        const auth = await authenticate(request);
        if (auth.error) {
          sendJson(response, auth.error.statusCode, auth.error.payload);
          return true;
        }

        sendJson(response, 200, {
          checkoutUrl: billing.buildCheckoutUrl(auth.user),
        });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/billing/customer-portal') {
        if (!config.configured) {
          sendJson(response, 503, {
            error: 'Premium billing is not configured on this deployment yet.',
            code: 'BILLING_UNAVAILABLE',
          });
          return true;
        }

        const auth = await authenticate(request);
        if (auth.error) {
          sendJson(response, auth.error.statusCode, auth.error.payload);
          return true;
        }

        try {
          const body = await readJsonBody(request);
          const portalUrl = await billing.createPortalUrl(auth.user, String(body.returnUrl || config.webAppUrl));
          sendJson(response, 200, { portalUrl });
        } catch (error) {
          sendJson(response, 409, {
            error: error.message || 'Unable to create a billing portal session.',
          });
        }
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/billing/webhook') {
        if (!config.configured) {
          sendJson(response, 503, {
            error: 'Premium billing is not configured on this deployment yet.',
            code: 'BILLING_UNAVAILABLE',
          });
          return true;
        }

        const signature = request.headers['stripe-signature'];
        if (typeof signature !== 'string' || !signature.trim()) {
          sendJson(response, 400, {
            error: 'A Stripe signature is required.',
          });
          return true;
        }

        try {
          const rawBody = await readRawBody(request);
          const result = await billing.processWebhook(rawBody, signature);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, 400, {
            error: error.message || 'Stripe webhook processing failed.',
          });
        }
        return true;
      }

      return false;
    },
  };
}
