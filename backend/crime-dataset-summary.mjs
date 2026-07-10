const BASE_URL = String(process.env.RISKRADAR_CRIME_SOURCE_BASE_URL || process.env.RISKRADAR_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

function parseArguments(argv) {
  const options = {
    month: '',
    monthLimit: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--month') {
      options.month = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (argument === '--month-limit') {
      options.monthLimit = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const url = new URL(`${BASE_URL}/api/crime-dataset-summary`);

  if (options.month) {
    url.searchParams.set('month', options.month);
  }

  if (options.monthLimit) {
    url.searchParams.set('monthLimit', options.monthLimit);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Crime dataset summary returned invalid JSON.\n${text}`);
  }

  if (!response.ok) {
    throw new Error(json?.error || `Crime dataset summary failed with ${response.status}.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        summary: json,
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
