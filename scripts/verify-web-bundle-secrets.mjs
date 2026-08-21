import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySupabaseKey } from '../auth/config.mjs';
import {
  BACKEND_SECRET_ENV_KEYS,
  readExpoBuildEnvironment,
} from './public-env-guard.mjs';

const SECRET_SHAPES = [
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /sk_(?:test|live)_[A-Za-z0-9_-]{16,}/,
  /whsec_[A-Za-z0-9_-]{16,}/,
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function containsLegacyServiceRoleJwt(text) {
  const candidates = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g) ?? [];
  return candidates.some((candidate) => classifySupabaseKey(candidate) === 'service_role');
}

export async function findWebBundleSecretLeaks(directory, env) {
  const root = path.resolve(directory);
  const candidates = BACKEND_SECRET_ENV_KEYS.flatMap((key) => {
    const value = typeof env[key] === 'string' ? env[key].trim() : '';
    return value.length >= 8 ? [{ key, value }] : [];
  });
  const leaks = [];

  for (const file of await listFiles(root)) {
    const content = (await readFile(file)).toString('utf8');
    const relativeFile = path.relative(root, file).replaceAll('\\', '/');
    const matchedSources = candidates
      .filter((candidate) => content.includes(candidate.value))
      .map((candidate) => candidate.key);

    if (matchedSources.length > 0) {
      for (const source of matchedSources) {
        leaks.push({ file: relativeFile, source });
      }
      continue;
    }

    if (SECRET_SHAPES.some((pattern) => pattern.test(content)) || containsLegacyServiceRoleJwt(content)) {
      leaks.push({ file: relativeFile, source: 'secret-shaped value' });
    }
  }

  return leaks;
}

async function runCli() {
  const directory = process.argv[2] || 'dist';
  const environment = readExpoBuildEnvironment(process.cwd(), process.env);
  const leaks = await findWebBundleSecretLeaks(directory, environment);
  if (leaks.length === 0) {
    console.log('Exported web bundle contains no backend credentials.');
    return;
  }

  console.error('Web build blocked because the exported bundle contains private credentials:');
  for (const leak of leaks) {
    console.error(`- ${leak.file}: matched ${leak.source}`);
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await runCli();
}
