import { mapSettledWithConcurrency } from '../bounded-concurrency.mjs';
import { buildDashboardView, buildWatchSnapshot } from './dashboard-view.mjs';

function mergedTrendData(analysis, monthlySeries) {
  return {
    ...(analysis?.trendData || {}),
    monthly: Array.isArray(monthlySeries?.monthly) ? monthlySeries.monthly : (analysis?.trendData?.monthly || []),
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

function normalizeDashboardError(error) {
  const message = String(error?.message || 'Police.uk data is temporarily unavailable for this watched place.');
  return /unavailable/i.test(message) ? message : `${message} This watched place is temporarily unavailable.`;
}

export function createDashboardRouteHandler({ watchlistStore, analyzeLocation, fetchMonthlyCrimeSeries }) {
  return {
    async handle(request, response, url, context) {
      if (
        request.method !== 'GET' ||
        url.pathname !== '/api/dashboard' ||
        !watchlistStore ||
        typeof analyzeLocation !== 'function' ||
        typeof fetchMonthlyCrimeSeries !== 'function'
      ) {
        return false;
      }

      const premium = await context.requirePremium(request);
      if (premium.error) {
        context.sendJson(response, premium.error.statusCode, premium.error.payload);
        return true;
      }

      const places = await watchlistStore.list(premium.user.userId);
      const selectedWatchId = String(url.searchParams.get('watchId') || '').trim() || null;

      if (!places.length) {
        context.sendJson(response, 200, buildDashboardView({
          places,
          analyses: [],
          entitlement: premium.entitlement,
          selectedWatchId,
        }));
        return true;
      }

      const generatedAt = context.now?.() || new Date().toISOString();
      const settled = await mapSettledWithConcurrency(places, 2, async (place) => {
        const analysis = await analyzeLocation(place.postcode);
        const monthlySeries = await fetchMonthlyCrimeSeries({
          postcode: place.postcode,
          monthCount: 12,
        });
        const snapshot = buildWatchSnapshot({
          ...analysis,
          trendData: mergedTrendData(analysis, monthlySeries),
        }, generatedAt);

        await watchlistStore.saveSnapshot(premium.user.userId, place.id, {
          dataMonth: snapshot.dataMonth,
          snapshot,
        });

        return {
          watchId: place.id,
          snapshot,
          previousSnapshot: place.lastSnapshot ?? null,
        };
      });

      const analyses = places.map((place, index) => {
        const result = settled[index];
        if (result?.status === 'fulfilled') {
          return result.value;
        }

        return {
          watchId: place.id,
          error: normalizeDashboardError(result?.reason),
        };
      });

      context.sendJson(response, 200, buildDashboardView({
        places,
        analyses,
        entitlement: premium.entitlement,
        selectedWatchId,
      }));
      return true;
    },
  };
}
