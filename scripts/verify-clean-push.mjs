import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parsePorcelainStatus(statusOutput) {
  return String(statusOutput || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3),
    }));
}

export function assertCleanWorktree(statusOutput) {
  const entries = parsePorcelainStatus(statusOutput);
  if (entries.length === 0) return;

  const details = entries.map((entry) => `  ${entry.status} ${entry.path}`).join('\n');
  const error = new Error(
    `Push blocked: Commit all changes before pushing.\n\nUncommitted files:\n${details}\n\nRun git status, review the files, then git add and git commit.`,
  );
  error.code = 'UNCOMMITTED_CHANGES';
  throw error;
}

export function verifyCleanWorktree() {
  const statusOutput = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' },
  );
  assertCleanWorktree(statusOutput);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    verifyCleanWorktree();
    console.log('Push guard passed: the working tree is fully committed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
