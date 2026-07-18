# Risk Evidence and Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy in-app Police.uk evidence, specific postcode-level risk signals, reliable report navigation, and a faster Sherlock-inspired scanner.

**Architecture:** Extract evidence sanitisation and risk-signal construction into a testable backend module used by the existing server. The React Native app adds a small evidence-detail state that preserves the current report and fetches a sanitised backend view model. Scanner motion remains dependency-free using React Native `Animated`.

**Tech Stack:** Node.js 22 test runner, Expo/React Native, TypeScript, React Native Animated, Police.uk API.

## Global Constraints

- Preserve the current RiskRadar visual language and existing map behavior.
- Follow Expo SDK 56 versioned documentation when writing Expo-facing code, while leaving the installed SDK unchanged.
- Never infer exact addresses, dates, people, or violent-crime subtypes absent from Police.uk.
- Keep the raw Police.uk endpoint as a secondary source link only.

---

### Task 1: Evidence Domain Module

**Files:**
- Create: `backend/crime-evidence.mjs`
- Create: `backend/crime-evidence.test.mjs`
- Modify: `backend/server.mjs`

**Interfaces:**
- Produces: `isValidPersistentId(value)`, `sanitizeOutcomeName(value)`, `buildEvidenceView(payload, persistentId)`, and `buildStructuredRiskSignals(input)`.
- Consumes: Police.uk outcome payloads and already-sanitised local crime records.

- [ ] **Step 1: Write failing tests for persistent-ID validation, neutral outcome wording, broad violent-category disclosure, road labels, and representative records.**
- [ ] **Step 2: Run `node --test backend/crime-evidence.test.mjs` and confirm failures identify the missing module.**
- [ ] **Step 3: Implement the smallest pure functions needed to satisfy those cases.**
- [ ] **Step 4: Run `node --test backend/crime-evidence.test.mjs` and confirm all cases pass.**

### Task 2: Evidence API and Analysis Payload

**Files:**
- Modify: `backend/server.mjs`
- Modify: `backend/smoke-test.mjs`

**Interfaces:**
- Consumes: `buildEvidenceView`, `buildStructuredRiskSignals` from Task 1.
- Produces: `GET /api/crime-evidence/:persistentId` and `crimeData.riskSignalDetails`.

- [ ] **Step 1: Add smoke assertions for JSON content type, invalid IDs, upstream-safe errors, and structured signal fields.**
- [ ] **Step 2: Run `npm run test:backend` and confirm the new assertions fail.**
- [ ] **Step 3: Add the validated proxy route and replace generic signal generation with the structured builder while keeping legacy `riskSignals` for compatibility.**
- [ ] **Step 4: Run `npm run test:backend` and confirm the backend suite passes.**

### Task 3: In-App Evidence Navigation

**Files:**
- Modify: `types.ts`
- Create: `components/EvidenceDetail.tsx`
- Modify: `components/IntelligenceCharts.tsx`
- Modify: `components/Results.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: an `EvidenceReference` selected from a hotspot or risk signal and `GET /api/crime-evidence/:persistentId`.
- Produces: `EVIDENCE` app state, `onOpenEvidence(reference)`, and `Back to report` behavior.

- [ ] **Step 1: Extend TypeScript types for structured signals, evidence references, and evidence detail responses.**
- [ ] **Step 2: Replace direct `Linking.openURL` calls with `onOpenEvidence`, preserving the raw URL in the reference.**
- [ ] **Step 3: Build `EvidenceDetail` with loading, success, unavailable, and error states; include a primary back action and secondary raw-source action.**
- [ ] **Step 4: Wire app state so the report remains in memory and Android hardware back returns to it.**
- [ ] **Step 5: Run `npm run typecheck` and fix all reported type errors.**

### Task 4: Specific Risk-Signal Presentation

**Files:**
- Modify: `components/Results.tsx`

**Interfaces:**
- Consumes: `crimeData.riskSignalDetails` and `onOpenEvidence` from Task 3.
- Produces: category-specific cards with count, month, approximate roads, source disclosure, and evidence buttons.

- [ ] **Step 1: Render structured signal cards with the existing typography, border, and colour language.**
- [ ] **Step 2: Add explicit broad-category copy for violent crime and postcode-radius wording for volume context.**
- [ ] **Step 3: Keep the current string-list fallback for older cached API responses.**
- [ ] **Step 4: Run `npm run typecheck`.**

### Task 5: Premium Scanner Motion

**Files:**
- Modify: `components/Scanner.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `postcode` and honest request duration state.
- Produces: a 1.8-second minimum scanner with upright orbiting icons, staggered pulses, subtle sweep, and final lock pulse.

- [ ] **Step 1: Reduce the target reveal duration from 2200 ms to 1800 ms.**
- [ ] **Step 2: Add separate animated values for orbit, staggered marker emphasis, sweep, and final lock without animating the main layout.**
- [ ] **Step 3: Ensure progress does not show 100 percent before the request is ready to reveal results.**
- [ ] **Step 4: Run `npm run typecheck` and `npm run build:web`.**

### Task 6: End-to-End Verification

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: complete backend and frontend implementation.
- Produces: objective evidence that the requested behavior works.

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npm run build:web`.**
- [ ] **Step 3: Start the API and verify SE10 8EP returns structured risk signals with roads and evidence IDs.**
- [ ] **Step 4: Request one evidence ID and verify readable JSON with neutral outcomes and a raw source URL.**
- [ ] **Step 5: Confirm the production bundle contains the in-app evidence route copy and no hotspot button directly navigates to a raw endpoint.**
