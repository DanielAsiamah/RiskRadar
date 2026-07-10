import { spawn } from 'node:child_process';

const BASE_URL = String(process.env.RISKRADAR_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const READY_TIMEOUT_MS = Math.max(1000, Number(process.env.RISKRADAR_VERIFY_TIMEOUT_MS) || 45000);
const READY_INTERVAL_MS = Math.max(250, Number(process.env.RISKRADAR_VERIFY_INTERVAL_MS) || 1500);

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

async function main() {
  const readiness = await waitForReady();
  if (!readiness.ok) {
    throw new Error(`Backend did not become ready within ${READY_TIMEOUT_MS}ms. Last status: ${readiness.statusCode}`);
  }

  const smoke = await runSmokeTest();
  if (smoke.code !== 0) {
    throw new Error(`Smoke test failed.\n${smoke.stderr || smoke.stdout}`.trim());
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        ready: true,
        smoke: JSON.parse(smoke.stdout),
      },
      null,
      2
    )
  );
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
