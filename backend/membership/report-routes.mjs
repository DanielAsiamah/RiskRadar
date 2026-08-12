import { compareWatchSnapshots } from './change-summary.mjs';
import { buildWatchSnapshot } from './dashboard-view.mjs';
import { buildMemberReport } from './report-view.mjs';

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

export function createReportRouteHandler({ watchlistStore, analyzeLocation, fetchMonthlyCrimeSeries }) {
  return {
    async handle(request, response, url, context) {
      if (
        request.method !== 'GET' ||
        !watchlistStore ||
        typeof analyzeLocation !== 'function' ||
        typeof fetchMonthlyCrimeSeries !== 'function'
      ) {
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

        const analysis = await analyzeLocation(place.postcode);
        const monthlySeries = await fetchMonthlyCrimeSeries({
          postcode: place.postcode,
          monthCount: 12,
        });
        const generatedAt = context.now?.() || new Date().toISOString();
        const mergedAnalysis = {
          ...analysis,
          trendData: mergedTrendData(analysis, monthlySeries),
        };
        const snapshot = buildWatchSnapshot(mergedAnalysis, generatedAt);
        const comparisonBase = buildComparisonBase(place, snapshot);
        const changeSummary = compareWatchSnapshots(snapshot, comparisonBase);

        if (place.lastCheckedMonth !== snapshot.dataMonth || !place.lastSnapshot) {
          await watchlistStore.saveSnapshot(premium.user.userId, place.id, {
            dataMonth: snapshot.dataMonth,
            snapshot,
          });
        }

        const report = buildMemberReport({
          place: {
            ...place,
            available: true,
            snapshot,
            changeSummary,
          },
          analysis: mergedAnalysis,
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
