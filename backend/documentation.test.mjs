import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('documents every public HTTP route', async () => {
  const [serverSource, installGuide] = await Promise.all([
    readFile('backend/server.mjs', 'utf8'),
    readFile('INSTALL.md', 'utf8'),
  ]);
  const routes = [...serverSource.matchAll(/url\.pathname === '([^']+)'/g)].map((match) => match[1]);

  assert.ok(routes.length > 20, 'Expected the server route extractor to find public routes.');
  for (const route of new Set(routes)) {
    assert.ok(installGuide.includes(route), `${route} is public but missing from INSTALL.md`);
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
  assert.match(dockerfile, /expo export --platform web/);
  assert.match(dockerfile, /COPY --from=web-builder .*\/app\/dist \.\/dist/);
  assert.match(renderBlueprint, /healthCheckPath: \/ready/);
  assert.match(installGuide, /EMBED_ALLOW_ORIGINS/);
});
