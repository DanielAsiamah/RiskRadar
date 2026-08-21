import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Docker web export runs the guarded build and runtime installs production dependencies', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');

  assert.match(dockerfile, /ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(dockerfile, /ARG EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(dockerfile, /RUN npm run build:web/);
  assert.match(
    dockerfile,
    /FROM node:22-alpine AS runtime[\s\S]*RUN npm ci --omit=dev/,
  );
});

test('Render exposes modern and legacy public-key build variables', async () => {
  const blueprint = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');

  assert.match(blueprint, /key: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(blueprint, /key: EXPO_PUBLIC_SUPABASE_ANON_KEY/);
});

test('all dotenv variants are ignored except the committed example', async () => {
  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  const lines = gitignore.split(/\r?\n/);

  assert.equal(lines.includes('.env*'), true);
  assert.equal(lines.includes('!.env.example'), true);
});
