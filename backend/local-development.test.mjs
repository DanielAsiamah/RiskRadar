import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function withServer(script, environment, check) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'riskradar-local-access-'));
  const webDir = path.join(root, 'dist');
  await mkdir(webDir);
  await writeFile(path.join(webDir, 'index.html'), '<!doctype html><div>Test web export</div>');
  const port = 42000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [script], {
    env: {
      HOST: '127.0.0.1', PORT: String(port), WEB_DIST_DIR: webDir,
      RISKRADAR_DATA_DIR: path.join(root, 'data'), LIVE_INGESTION_AUTOSTART: 'false',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 15000);
      const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      child.once('error', finish);
      child.once('exit', (code) => finish(new Error(`Server exited ${code}: ${output}`)));
      child.stdout.on('data', () => { if (output.includes('RiskRadar API listening')) finish(); });
    });
    await check(`http://127.0.0.1:${port}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.send({ type: 'riskradar:shutdown', signal: 'SIGTERM' });
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test('the real local launcher serves the website and grants only same-origin development access', { timeout: 25000 }, async () => {
  await withServer('scripts/start-local-api.mjs', {}, async (base) => {
    assert.equal((await fetch(base)).status, 200);
    const status = await fetch(`${base}/api/route-guard/status`);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    const payload = await status.json();
    assert.equal(payload.provider, 'free-osm');
    assert.equal(payload.access.localDevelopment, true);
    assert.equal(payload.supabase.requiredForRouteScan, false);
    // fetch rewrites Host, so use a raw HTTP request to exercise DNS-rebinding protection.
    const scan = (headers = {}) => new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${base}/api/route-guard`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      }, (response) => { response.resume(); resolve({ status: response.statusCode }); });
      outgoing.on('error', reject);
      outgoing.end(JSON.stringify({ entitlement: 'pro', routeScansUsed: 0 }));
    });
    // Validation, not an account gate, should reject this incomplete route.
    assert.equal((await scan({ Origin: base })).status, 400);
    for (const headers of [{ Origin: 'https://external.example' }, { 'X-Forwarded-For': '127.0.0.1' }, { Host: 'external.example' }]) {
      assert.equal((await scan(headers)).status, 503, JSON.stringify(headers));
    }
  });
});

test('the production server cannot enable local development access or trust claimed PRO', { timeout: 25000 }, async () => {
  await withServer('backend/server.mjs', { NODE_ENV: 'production', ROUTE_GUARD_LOCAL_DEVELOPMENT: 'true' }, async (base) => {
    const status = await (await fetch(`${base}/api/route-guard/status`)).json();
    assert.equal(status.access.localDevelopment, false);
    const response = await fetch(`${base}/api/route-guard`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: 'Waterloo', destination: 'London Bridge', travelMode: 'walking', entitlement: 'pro', routeScansUsed: 0 }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'ROUTE_GUARD_AUTH_UNAVAILABLE');
  });
});
