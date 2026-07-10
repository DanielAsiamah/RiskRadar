import { spawn } from 'node:child_process';

const BASE_URL = String(process.env.RISKRADAR_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const READY_TIMEOUT_MS = Math.max(1000, Number(process.env.RISKRADAR_VERIFY_TIMEOUT_MS) || 45000);
const READY_INTERVAL_MS = Math.max(250, Number(process.env.RISKRADAR_VERIFY_INTERVAL_MS) || 1500);
const SERVER_BOOT_TIMEOUT_MS = Math.max(2000, Number(process.env.RISKRADAR_VERIFY_SERVER_BOOT_TIMEOUT_MS) || 8000);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastStatus = 'unknown';
  let lastBody = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/ready`, {
        headers: {
          Accept: 'application/json',
        },
      });
      lastStatus = String(response.status);
      const text = await response.text();
      lastBody = text || null;

      if (response.status === 200) {
        return {
          ok: true,
          statusCode: response.status,
          body: lastBody,
        };
      }
    } catch (error) {
      lastStatus = error.message || 'fetch-error';
      lastBody = null;
    }

    await sleep(READY_INTERVAL_MS);
  }

  return {
    ok: false,
    statusCode: lastStatus,
    body: lastBody,
  };
}

function runSmokeTest() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['backend/smoke-test.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RISKRADAR_SMOKE_BASE_URL: BASE_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

function runPrewarm() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['backend/prewarm.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RISKRADAR_PREWARM_BASE_URL: BASE_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

function hasCacheActivity(scopeStats, scopeName) {
  const scope = scopeStats?.[scopeName];
  return ((scope?.misses || 0) + (scope?.hits || 0)) >= 1;
}

function isLocalBaseUrl() {
  try {
    const parsed = new URL(BASE_URL);
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function startLocalBackend() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['backend/server.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const bootTimer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({
        child,
        stdout,
        stderr,
      });
    }, SERVER_BOOT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(bootTimer);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(bootTimer);
      reject(new Error(`Auto-started backend exited early with code ${code}.\n${stderr || stdout}`.trim()));
    });
  });
}

async function stopChildProcess(child) {
  if (!child || child.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve();
    }, 4000);

    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function main() {
  let ownedBackend = null;

  try {
    let readiness = await waitForReady();
    let autoStarted = false;

    if (!readiness.ok && isLocalBaseUrl()) {
      ownedBackend = await startLocalBackend();
      autoStarted = true;
      readiness = await waitForReady();
    }

    if (!readiness.ok) {
      throw new Error(`Backend did not become ready within ${READY_TIMEOUT_MS}ms. Last status: ${readiness.statusCode}`);
    }

    const smoke = await runSmokeTest();
    if (smoke.code !== 0) {
      throw new Error(`Smoke test failed.\n${smoke.stderr || smoke.stdout}`.trim());
    }

    const prewarm = await runPrewarm();
    if (prewarm.code !== 0) {
      throw new Error(`Prewarm failed.\n${prewarm.stderr || prewarm.stdout}`.trim());
    }

    const prewarmJson = JSON.parse(prewarm.stdout);
    const cacheAfter = prewarmJson?.cacheAfter;
    const scopeStats = cacheAfter?.stats?.scopes;

    if (!cacheAfter || !scopeStats) {
      throw new Error('Prewarm did not return analysis cache stats.');
    }

    if (!hasCacheActivity(scopeStats, 'map-feed')) {
      throw new Error('Prewarm did not record any map-feed cache warmup activity.');
    }

    if (!hasCacheActivity(scopeStats, 'map-intelligence')) {
      throw new Error('Prewarm did not record any map-intelligence cache warmup activity.');
    }

    if (!hasCacheActivity(scopeStats, 'map-compare')) {
      throw new Error('Prewarm did not record any map-compare cache warmup activity.');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl: BASE_URL,
          ready: true,
          autoStartedBackend: autoStarted,
          smoke: JSON.parse(smoke.stdout),
          prewarm: prewarmJson,
        },
        null,
        2
      )
    );
  } finally {
    await stopChildProcess(ownedBackend?.child);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: BASE_URL,
        error: error.message || String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
