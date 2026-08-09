import { execFileSync } from 'node:child_process';

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const repositoryRoot = runGit(['rev-parse', '--show-toplevel']);
runGit(['config', 'core.hooksPath', '.githooks']);
const configuredPath = runGit(['config', '--get', 'core.hooksPath']);

if (configuredPath !== '.githooks') {
  throw new Error(`Git hook setup failed: expected .githooks, received ${configuredPath || 'nothing'}.`);
}

console.log(`Git push guard enabled for ${repositoryRoot}`);
