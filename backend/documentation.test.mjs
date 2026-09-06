import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { apiCatalog } from './api-catalog.mjs';

test('documents every public HTTP route', async () => {
  const [serverSource, membershipSource, watchlistSource, dashboardSource, alertPreferencesSource, reportRoutesSource, liveIncidentRoutesSource, installGuide] = await Promise.all([
    readFile('backend/server.mjs', 'utf8'),
    readFile('backend/membership/routes.mjs', 'utf8'),
    readFile('backend/membership/watchlist-routes.mjs', 'utf8'),
    readFile('backend/membership/dashboard-routes.mjs', 'utf8'),
    readFile('backend/membership/alert-preferences.mjs', 'utf8'),
    readFile('backend/membership/report-routes.mjs', 'utf8'),
    readFile('backend/live-incidents/routes.mjs', 'utf8'),
    readFile('INSTALL.md', 'utf8'),
  ]);
  const combinedSource = `${serverSource}\n${membershipSource}\n${watchlistSource}\n${dashboardSource}\n${alertPreferencesSource}\n${reportRoutesSource}\n${liveIncidentRoutesSource}`;
  const routes = [...combinedSource.matchAll(/url\.pathname === '([^']+)'/g)].map((match) => match[1]);

  if (combinedSource.includes("/^\\/api\\/watchlist\\/([^/]+)$/")) {
    routes.push('/api/watchlist/:id');
  }
  if (combinedSource.includes("/^\\/api\\/reports\\/([^/]+)$/")) {
    routes.push('/api/reports/:watchId');
  }
  if (combinedSource.includes("/^\\/api\\/reports\\/([^/]+)\\/share$/")) {
    routes.push('/api/reports/:watchId/share');
  }
  if (combinedSource.includes("url.pathname.startsWith('/api/live-incidents/')")) {
    routes.push('/api/live-incidents/:id');
  }

  assert.ok(routes.length > 20, 'Expected the server route extractor to find public routes.');
  for (const route of new Set(routes)) {
    assert.ok(installGuide.includes(route), `${route} is public but missing from INSTALL.md`);
  }
});

test('catalogues every method and path implemented by the router', async () => {
  const [serverSource, membershipSource, watchlistSource, dashboardSource, alertPreferencesSource, reportRoutesSource, liveIncidentRoutesSource, routeGuardSource] = await Promise.all([
    readFile('backend/server.mjs', 'utf8'),
    readFile('backend/membership/routes.mjs', 'utf8'),
    readFile('backend/membership/watchlist-routes.mjs', 'utf8'),
    readFile('backend/membership/dashboard-routes.mjs', 'utf8'),
    readFile('backend/membership/alert-preferences.mjs', 'utf8'),
    readFile('backend/membership/report-routes.mjs', 'utf8'),
    readFile('backend/live-incidents/routes.mjs', 'utf8'),
    readFile('backend/route-guard.mjs', 'utf8'),
  ]);
  const combinedSource = `${serverSource}\n${membershipSource}\n${watchlistSource}\n${dashboardSource}\n${alertPreferencesSource}\n${reportRoutesSource}\n${liveIncidentRoutesSource}\n${routeGuardSource}`;
  const implemented = [...combinedSource.matchAll(/request\.method === '([^']+)' && url\.pathname === '([^']+)'/g)]
    .map((match) => `${match[1]} ${match[2]}`)
    .concat(watchlistSource.includes("url.pathname === '/api/watchlist'")
      ? ['GET /api/watchlist', 'POST /api/watchlist']
      : [])
    .concat(dashboardSource.includes("url.pathname !== '/api/dashboard'")
      ? ['GET /api/dashboard']
      : [])
    .concat(alertPreferencesSource.includes("url.pathname !== '/api/alert-preferences'")
      ? ['GET /api/alert-preferences', 'PUT /api/alert-preferences']
      : [])
    .concat(reportRoutesSource.includes("/^\\/api\\/reports\\/([^/]+)$/")
      ? ['GET /api/reports/:watchId']
      : [])
    .concat(reportRoutesSource.includes("/^\\/api\\/reports\\/([^/]+)\\/share$/")
      ? ['GET /api/reports/:watchId/share']
      : [])
    .concat(combinedSource.includes("url.pathname.startsWith('/api/live-incidents/')")
      ? ['GET /api/live-incidents/:id']
      : [])
    .concat(routeGuardSource.includes("url.pathname !== '/api/route-guard'")
      ? ['POST /api/route-guard']
      : [])
    .concat(combinedSource.includes("/^\\/api\\/watchlist\\/([^/]+)$/")
      ? ['PATCH /api/watchlist/:id', 'DELETE /api/watchlist/:id']
      : [])
    .sort();
  const catalogued = apiCatalog.endpoints
    .map((item) => `${item.method} ${item.path}`)
    .sort();

  assert.deepEqual(catalogued, implemented);
  for (const item of apiCatalog.endpoints) {
    assert.ok(item.summary.length >= 20, `${item.method} ${item.path} needs a useful summary`);
    assert.ok(['public', 'member', 'admin'].includes(item.access));
  }
});

test('keeps deployment documentation aligned with runtime requirements', async () => {
  const [packageJsonText, installGuide, dockerfile, renderBlueprint] = await Promise.all([
    readFile('package.json', 'utf8'),
    readFile('INSTALL.md', 'utf8'),
    readFile('Dockerfile', 'utf8'),
    readFile('render.yaml', 'utf8'),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.equal(packageJson.engines.node, '>=22.13.0');
  assert.match(installGuide, /Node\.js 22\.13 or newer/);
  assert.match(dockerfile, /RUN npm run build:web/);
  assert.match(packageJson.scripts['build:web'], /expo export --platform web/);
  assert.match(dockerfile, /COPY --from=web-builder .*\/app\/dist \.\/dist/);
  assert.match(renderBlueprint, /healthCheckPath: \/ready/);
  assert.match(installGuide, /EMBED_ALLOW_ORIGINS/);
});
