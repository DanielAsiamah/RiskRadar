import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCleanWorktree, parsePorcelainStatus } from './verify-clean-push.mjs';

test('allows a push when the worktree has no uncommitted files', () => {
  assert.doesNotThrow(() => assertCleanWorktree(''));
  assert.deepEqual(parsePorcelainStatus('\n'), []);
});

test('rejects staged, unstaged, and untracked files before push', () => {
  const status = [
    'M  staged-file.ts',
    ' M unstaged-file.ts',
    '?? untracked-file.ts',
  ].join('\n');

  assert.deepEqual(parsePorcelainStatus(status), [
    { status: 'M ', path: 'staged-file.ts' },
    { status: ' M', path: 'unstaged-file.ts' },
    { status: '??', path: 'untracked-file.ts' },
  ]);
  assert.throws(
    () => assertCleanWorktree(status),
    (error) => {
      assert.equal(error.code, 'UNCOMMITTED_CHANGES');
      assert.match(error.message, /Commit all changes before pushing/i);
      assert.match(error.message, /staged-file\.ts/);
      assert.match(error.message, /unstaged-file\.ts/);
      assert.match(error.message, /untracked-file\.ts/);
      return true;
    },
  );
});

test('preserves renamed paths in the rejection message', () => {
  const entries = parsePorcelainStatus('R  old-name.ts -> new-name.ts');

  assert.deepEqual(entries, [{ status: 'R ', path: 'old-name.ts -> new-name.ts' }]);
});
