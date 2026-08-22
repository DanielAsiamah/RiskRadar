import crypto from 'node:crypto';

import { compareWatchSnapshots } from './change-summary.mjs';
import { buildWatchSnapshot } from './dashboard-view.mjs';
import { buildMemberReport } from './report-view.mjs';

const REPORT_SHARE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function mergedTrendData(analysis, monthlySeries) {
  return {
    ...(analysis?.trendData || {}),
    monthly: Array.isArray(monthlySeries?.monthly)
      ? monthlySeries.monthly
      : (analysis?.trendData?.monthly || []),
    direction: monthlySeries?.direction ?? analysis?.trendData?.direction ?? 'stable',
    changePercent: Number.isFinite(monthlySeries?.changePercent)
      ? monthlySeries.changePercent
      : (analysis?.trendData?.changePercent ?? 0),
    categoryDirection: monthlySeries?.categoryDirection ?? analysis?.trendData?.categoryDirection ?? {
      violentCrimes: 'stable',
      antiSocialCrimes: 'stable',
      robberyCrimes: 'stable',
    },
    summary: monthlySeries?.summary ?? analysis?.trendData?.summary ?? '',
    dataQuality: monthlySeries?.dataQuality ?? analysis?.trendData?.dataQuality ?? null,
  };
}

function buildComparisonBase(place, currentSnapshot) {
  if (place?.lastSnapshot && place.lastCheckedMonth && place.lastCheckedMonth !== currentSnapshot.dataMonth) {
    return place.lastSnapshot;
  }

  return {
    dataMonth: '',
    score: currentSnapshot.score,
    totalIncidents: currentSnapshot.totalIncidents,
    categories: currentSnapshot.categories,
    trend: currentSnapshot.trend.slice(0, -1),
    topRoads: currentSnapshot.topRoads,
    generatedAt: currentSnapshot.generatedAt,
  };
}

function mapReportError(error) {
  if (error?.code === 'WATCH_NOT_FOUND') {
    return {
      statusCode: 404,
      payload: {
        error: error.message || 'Watched place not found.',
        code: 'WATCH_NOT_FOUND',
      },
    };
  }

  return {
    statusCode: Number(error?.status) || 500,
    payload: {
      error: error?.message || 'Unable to build this Premium report right now.',
      code: error?.code || null,
    },
  };
}

function createReportShareToken({ userId, watchId, issuedAt }, secret) {
  const payload = JSON.stringify({ userId, watchId, issuedAt });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function currentTimestampMillis(context) {
  if (typeof context?.now === 'function') {
    const value = Date.parse(context.now());
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return Date.now();
}

function verifyReportShareToken(token, secret, now = Date.now()) {
  const normalized = String(token || '').trim();
  const [encodedPayload, providedSignature] = normalized.split('.');

  if (!encodedPayload || !providedSignature) {
    throw {
      status: 400,
      code: 'INVALID_SHARE_TOKEN',
      message: 'A valid report share token is required.',
    };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw {
      status: 403,
      code: 'INVALID_SHARE_TOKEN',
      message: 'This report share link is invalid.',
    };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw {
      status: 400,
      code: 'INVALID_SHARE_TOKEN',
      message: 'This report share link could not be read.',
    };
  }

  const issuedAt = Number(payload?.issuedAt);
  if (!payload?.userId || !payload?.watchId || !Number.isFinite(issuedAt)) {
    throw {
      status: 400,
      code: 'INVALID_SHARE_TOKEN',
      message: 'This report share link is missing required information.',
    };
  }

  if (now - issuedAt > REPORT_SHARE_MAX_AGE_MS) {
    throw {
      status: 410,
      code: 'REPORT_SHARE_EXPIRED',
      message: 'This report share link has expired.',
    };
  }

  return {
    userId: String(payload.userId),
    watchId: String(payload.watchId),
    issuedAt,
  };
}

function buildReportShareUrl(webAppUrl, token) {
  const url = new URL(webAppUrl);
  url.searchParams.set('report', token);
  return url.toString();
}

function sanitizeSharedReport(report) {
  return {
    ...report,
    watchId: '',
    title: `${report.postcode} RiskRadar shared report`,
    label: report.postcode,
    disclaimer: `${report.disclaimer} Shared links show informational area intelligence only and do not prove real-time safety.`,
  };
}

async function buildLatestMemberReport({ place, userId, analyzeLocation, fetchMonthlyCrimeSeries, watchlistStore, persistSnapshot, generatedAt }) {
  const analysis = await analyzeLocation(place.postcode);
  const monthlySeries = await fetchMonthlyCrimeSeries({
    postcode: place.postcode,
    monthCount: 12,
  });
  const mergedAnalysis = {
    ...analysis,
    trendData: mergedTrendData(analysis, monthlySeries),
  };
  const snapshot = buildWatchSnapshot(mergedAnalysis, generatedAt);
  const comparisonBase = buildComparisonBase(place, snapshot);
  const changeSummary = compareWatchSnapshots(snapshot, comparisonBase);

  if (persistSnapshot && (place.lastCheckedMonth !== snapshot.dataMonth || !place.lastSnapshot)) {
    await watchlistStore.saveSnapshot(userId, place.id, {
      dataMonth: snapshot.dataMonth,
      snapshot,
    });
  }

  return buildMemberReport({
    place: {
      ...place,
      available: true,
      snapshot,
      changeSummary,
    },
    analysis: mergedAnalysis,
    generatedAt,
  });
}

export function createReportRouteHandler({ config, watchlistStore, analyzeLocation, fetchMonthlyCrimeSeries }) {
  return {
    async handle(request, response, url, context) {
      if (
        !watchlistStore ||
        typeof analyzeLocation !== 'function' ||
        typeof fetchMonthlyCrimeSeries !== 'function'
      ) {
        return false;
      }

      if (request.method === 'GET' && url.pathname === '/api/report-share') {
        try {
          const token = String(url.searchParams.get('token') || '');
          const verified = verifyReportShareToken(token, config.billingReferenceSecret, currentTimestampMillis(context));
          const places = await watchlistStore.list(verified.userId);
          const place = places.find((entry) => entry.id === verified.watchId);

          if (!place) {
            throw {
              status: 404,
              code: 'WATCH_NOT_FOUND',
              message: 'Shared report source was not found.',
            };
          }

          const generatedAt = new Date(verified.issuedAt).toISOString();
          const report = await buildLatestMemberReport({
            place,
            userId: verified.userId,
            analyzeLocation,
            fetchMonthlyCrimeSeries,
            watchlistStore,
            persistSnapshot: false,
            generatedAt,
          });

          context.sendJson(response, 200, sanitizeSharedReport(report), {
            'Cache-Control': 'public, max-age=300',
          });
          return true;
        } catch (error) {
          const mapped = mapReportError(error);
          context.sendJson(response, mapped.statusCode, mapped.payload, {
            'Cache-Control': 'no-store',
          });
          return true;
        }
      }

      if (request.method === 'GET') {
        const shareMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/share$/);
        if (shareMatch) {
          const premium = await context.requirePremium(request);
          if (premium.error) {
            context.sendJson(response, premium.error.statusCode, premium.error.payload);
            return true;
          }

          try {
            const watchId = decodeURIComponent(shareMatch[1]);
            const places = await watchlistStore.list(premium.user.userId);
            const place = places.find((entry) => entry.id === watchId);

            if (!place) {
              throw {
                status: 404,
                code: 'WATCH_NOT_FOUND',
                message: 'Watched place not found.',
              };
            }

            const issuedAt = currentTimestampMillis(context);
            const token = createReportShareToken({
              userId: premium.user.userId,
              watchId: place.id,
              issuedAt,
            }, config.billingReferenceSecret);
            const expiresAt = new Date(issuedAt + REPORT_SHARE_MAX_AGE_MS).toISOString();
            const shareUrl = buildReportShareUrl(config.webAppUrl, token);

            context.sendJson(response, 200, {
              watchId: place.id,
              shareUrl,
              expiresAt,
            }, {
              'Cache-Control': 'private, no-store',
            });
            return true;
          } catch (error) {
            const mapped = mapReportError(error);
            context.sendJson(response, mapped.statusCode, mapped.payload, {
              'Cache-Control': 'private, no-store',
            });
            return true;
          }
        }
      }

      if (request.method !== 'GET') {
        return false;
      }

      const match = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (!match) {
        return false;
      }

      const premium = await context.requirePremium(request);
      if (premium.error) {
        context.sendJson(response, premium.error.statusCode, premium.error.payload);
        return true;
      }

      try {
        const watchId = decodeURIComponent(match[1]);
        const places = await watchlistStore.list(premium.user.userId);
        const place = places.find((entry) => entry.id === watchId);

        if (!place) {
          throw {
            status: 404,
            code: 'WATCH_NOT_FOUND',
            message: 'Watched place not found.',
          };
        }

        const generatedAt = context.now?.() || new Date().toISOString();
        const report = await buildLatestMemberReport({
          place,
          userId: premium.user.userId,
          analyzeLocation,
          fetchMonthlyCrimeSeries,
          watchlistStore,
          persistSnapshot: true,
          generatedAt,
        });

        context.sendJson(response, 200, report, {
          'Cache-Control': 'private, no-store',
        });
        return true;
      } catch (error) {
        const mapped = mapReportError(error);
        context.sendJson(response, mapped.statusCode, mapped.payload, {
          'Cache-Control': 'private, no-store',
        });
        return true;
      }
    },
  };
}
