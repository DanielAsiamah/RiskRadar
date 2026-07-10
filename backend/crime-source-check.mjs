const BASE_URL = String(process.env.RISKRADAR_CRIME_SOURCE_BASE_URL || process.env.RISKRADAR_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

async function main() {
  const response = await fetch(`${BASE_URL}/api/crime-source-status`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Crime source status returned invalid JSON.\n${text}`);
  }

  if (!response.ok) {
    throw new Error(json?.error || `Crime source status failed with ${response.status}.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        status: json,
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
