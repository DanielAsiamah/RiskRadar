import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('SIGTERM drains the server and flushes state', { timeout: 20000 }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'riskradar-shutdown-'));
  const port = 33000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['backend/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      RISKRADAR_DATA_DIR: dataDir,
      STARTUP_GRACE_PERIOD_MS: '0',
      SHUTDOWN_TIMEOUT_MS: '3000',
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

    child.send({ type: 'riskradar:shutdown', signal: 'SIGTERM' });
    const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));

    assert.equal(exit.code, 0, stderr);
    assert.match(stdout, /received SIGTERM; draining requests/);
    assert.match(stdout, /shutdown complete with exit code 0/);

    const persisted = JSON.parse(await readFile(path.join(dataDir, 'upstream-cache.json'), 'utf8'));
    assert.ok(Array.isArray(persisted.entries));
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
