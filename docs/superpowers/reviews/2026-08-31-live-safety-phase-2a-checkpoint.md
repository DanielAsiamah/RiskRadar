# Live Safety Network Phase 2A Transfer Checkpoint

This file preserves the exact implementation state needed to continue Phase 2A on another computer.

## Authoritative Branch

- Repository: `https://github.com/DanielAsiamah/RiskRadar.git`
- Continue from branch: `Macbook`
- The branch name is historical; it is valid on Windows, macOS, or Linux.
- Approved design: `docs/superpowers/specs/2026-08-27-riskradar-live-safety-network-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-27-riskradar-live-safety-network-phase-2a.md`

## Completed

- Task 1 canonical incident contracts, geometry helpers, lifecycle rules, private observation hashing, and public projections were implemented in `03cccfb`.
- The focused command `node --test backend/live-incidents/contracts.test.mjs` passed 10 tests.
- The existing full `npm test` suite passed at the Task 1 checkpoint.
- EAS project binding and build profiles were preserved in `7e0a436`.

## Required Resume Point

Resume at Task 1 review fix round before starting Task 2. An independent review found these Important issues:

1. Strengthen `toPublicIncident` and `toPublicVersion` so allowed nested values are validated and reconstructed rather than copied. Public output must reject malformed canonical metadata and cannot leak nested raw evidence, source keys, victim/suspect data, or private addresses.
2. Reject malformed numeric coordinate arrays and centroids instead of coercing `null`, booleans, or numeric strings with `Number(...)`. Only the explicitly supported provider string form `"longitude latitude"` may be parsed.
3. Preserve own `__proto__` JSON keys during stable payload cloning and hashing by using a null-prototype object or `Object.defineProperty`.

Add failing regression tests for each issue first, verify RED, apply the fixes, rerun the focused suite and `npm test`, then continue with Task 2 publication policy and deduplication.

## Transfer Verification

The transfer audit intentionally excludes local `.env*`, dependency folders, build output, and ignored implementation-ledger scratch files. Secrets must be recreated from the new computer's private environment or service dashboards and must never be committed.
