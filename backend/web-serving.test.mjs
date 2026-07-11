import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('serves the web app and API from one process', { timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'riskradar-web-'));
  const webDir = path.join(root, 'dist');
  const dataDir = path.join(root, 'data');
  const port = 35000 + Math.floor(Math.random() * 2000);
  await mkdir(webDir, { recursive: true });
  await writeFile(path.join(webDir, 'index.html'), '<!doctype html><div id="root">RiskRadar</div>');
  await writeFile(path.join(webDir, 'app.js'), 'globalThis.RiskRadar=true;');

  const child = spawn(process.execPath, ['backend/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      WEB_APP_ENABLED: 'true',
      WEB_DIST_DIR: webDir,
      EMBED_ALLOW_ORIGINS: 'https://example.com,https://*.example.org,invalid-value',
      RISKRADAR_DATA_DIR: dataDir,
      STARTUP_GRACE_PERIOD_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start.\n${stdout}\n${stderr}`)), 8000);
      child.stdout.on('data', () => {
        if (stdout.includes('RiskRadar API listening')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', reject);
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const [rootResponse, routeResponse, assetResponse, healthResponse, missingResponse] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/embed`),
      fetch(`${baseUrl}/app.js`, { method: 'HEAD' }),
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/missing.js`),
    ]);

    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get('content-type') || '', /^text\/html/);
    assert.equal(
      rootResponse.headers.get('content-security-policy'),
      "frame-ancestors 'self' https://example.com https://*.example.org"
    );
    assert.equal(await routeResponse.text(), '<!doctype html><div id="root">RiskRadar</div>');
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('cache-control') || '', /immutable/);
    assert.equal(healthResponse.status, 200);
    assert.equal(missingResponse.status, 404);
  } finally {
    if (child.exitCode === null) {
      child.send({ type: 'riskradar:shutdown', signal: 'SIGTERM' });
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await rm(root, { recursive: true, force: true });
  }
});
