import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function startServer() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'riskradar-safety-'));
  const port = 37000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['backend/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      RISKRADAR_DATA_DIR: root,
      RATE_LIMIT_ENABLED: 'false',
      STARTUP_GRACE_PERIOD_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

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

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode === null) {
        child.send({ type: 'riskradar:shutdown', signal: 'SIGTERM' });
        await new Promise((resolve) => child.once('exit', resolve));
      }
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

test('creates, lists, checks in, and shares a Safety Session without exposing trusted email', { timeout: 20000 }, async () => {
  const server = await startServer();

  try {
    const createResponse = await fetch(`${server.baseUrl}/api/safety-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: 'SW1A 1AA',
        purpose: 'marketplace',
        meetingContact: 'Facebook Marketplace seller',
        trustedEmail: 'friend@example.com',
        expectedEndAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        notes: 'Meet outside a busy station.',
      }),
    });
    const created = await readJson(createResponse);

    assert.equal(createResponse.status, 200);
    assert.match(created.id, /^session_/);
    assert.equal(created.destination, 'SW1A 1AA');
    assert.equal(created.status, 'active');
    assert.equal(created.alertState, 'pending');
    assert.match(created.shareToken, /^[A-Za-z0-9_-]{20,}$/);
    assert.match(created.shareUrl, /\/safety-session\?token=/);

    const listResponse = await fetch(`${server.baseUrl}/api/safety-sessions`);
    const listed = await readJson(listResponse);

    assert.equal(listResponse.status, 200);
    assert.equal(listed.sessions.length, 1);
    assert.equal(listed.sessions[0].id, created.id);

    const checkInResponse = await fetch(`${server.baseUrl}/api/safety-sessions/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: created.id }),
    });
    const checkedIn = await readJson(checkInResponse);

    assert.equal(checkInResponse.status, 200);
    assert.equal(checkedIn.status, 'checked-in');
    assert.equal(checkedIn.alertState, 'cancelled');

    const shareResponse = await fetch(`${server.baseUrl}/api/safety-session-share?token=${encodeURIComponent(created.shareToken)}`);
    const shared = await readJson(shareResponse);

    assert.equal(shareResponse.status, 200);
    assert.equal(shared.session.id, created.id);
    assert.equal(shared.session.status, 'checked-in');
    assert.equal(shared.session.destination, 'SW1A 1AA');
    assert.equal('trustedEmail' in shared.session, false);
    assert.equal(shared.disclaimer.includes('does not contact emergency services'), true);
  } finally {
    await server.stop();
  }
});
