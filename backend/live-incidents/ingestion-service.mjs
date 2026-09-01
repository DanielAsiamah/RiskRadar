import { createHash } from 'node:crypto';

import { createSourceObservation, normalizeIncidentDraft } from './contracts.mjs';
import { buildIncidentFingerprint } from './deduplication.mjs';
import { evaluatePublication } from './publication-policy.mjs';
import { LIVE_RISK_POLICY_VERSION } from './risk-overlay.mjs';

function clone(value) {
  return structuredClone(value);
}

function timestamp(now) {
  return now().toISOString();
}

function incidentIdFor(fingerprint) {
  return `inc_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}`;
}

function riskConstraintsFor(decision) {
  return {
    maxScoreDelta: decision.maxScoreDelta,
    canTriggerMajorAlert: decision.canTriggerMajorAlert,
    canTriggerRouteAvoidance: decision.canTriggerRouteAvoidance,
  };
}

function materialFields(previous, next) {
  const fields = [
    'category', 'subcategory', 'title', 'summary', 'status', 'severity', 'geometry', 'centroid',
    'locationLabel', 'locationPrecision', 'affectedRadiusMetres', 'expiresAt', 'publicationState',
    'verificationLevel', 'confidence', 'independentSourceCount', 'riskConstraints', 'sourceUrl',
  ];
  return fields.filter((field) => JSON.stringify(previous[field]) !== JSON.stringify(next[field]));
}

function canonicalIncident({ draft, observation, decision, existing, capturedAt }) {
  const fingerprint = buildIncidentFingerprint({
    provider: draft.provider,
    externalId: draft.externalId,
    category: draft.category,
    title: draft.title,
    centroid: draft.centroid,
    sourceOccurredAt: draft.sourceOccurredAt,
    severity: draft.severity,
  });
  const sourceKey = `${draft.provider}:${draft.externalId}`;
  const currentVersion = (existing?.currentVersion ?? 0) + 1;
  const isMaterialActiveUpdate = existing && draft.status === 'active' && ['active', 'updated'].includes(existing.status);
  const status = isMaterialActiveUpdate ? 'updated' : draft.status;
  return {
    id: existing?.id ?? incidentIdFor(fingerprint), fingerprint, provider: draft.provider, category: draft.category,
    subcategory: draft.subcategory, title: draft.title, summary: draft.summary, status, publicationState: decision.publicationState,
    verificationLevel: decision.verificationLevel, confidence: decision.confidence, severity: draft.severity,
    geometry: clone(draft.geometry), centroid: clone(draft.centroid), locationLabel: draft.locationLabel,
    locationPrecision: draft.locationPrecision, affectedRadiusMetres: draft.affectedRadiusMetres,
    firstObservedAt: existing?.firstObservedAt ?? capturedAt, sourceOccurredAt: draft.sourceOccurredAt,
    lastObservedAt: capturedAt, resolvedAt: ['resolved', 'retracted'].includes(status) ? capturedAt : null,
    expiresAt: draft.expiresAt, independentSourceCount: draft.independentSourceCount ?? 1, currentVersion,
    createdAt: existing?.createdAt ?? capturedAt, updatedAt: capturedAt, sourceUrl: observation.sourceUrl,
    sourceUpdatedAt: observation.sourceUpdatedAt, sourceKeys: [...new Set([...(existing?.sourceKeys ?? []), sourceKey])],
    primarySourceObservationId: observation.id, riskConstraints: riskConstraintsFor(decision),
  };
}

function resultCounts() {
  return { created: 0, updated: 0, unchanged: 0, review: 0, rejected: 0, resolved: 0 };
}

export function createLiveIncidentIngestionService({ store, adapters, now = () => new Date(), logger = console } = {}) {
  if (!store || typeof store.insertObservation !== 'function') throw new TypeError('store must implement live incident repository methods');
  if (!Array.isArray(adapters)) throw new TypeError('adapters must be an array');
  const adaptersBySourceId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const running = new Map();

  async function execute({ sourceId, requestedBy = 'system', force = false }) {
    const adapter = adaptersBySourceId.get(sourceId);
    if (!adapter) throw new RangeError(`Unknown live source: ${sourceId}`);
    const startedAt = timestamp(now);
    const runId = `run_${sourceId}_${Date.parse(startedAt)}`;
    const previousState = await store.getSourceState(sourceId);
    if (previousState.state === 'disabled' || previousState.state === 'not-configured') {
      return { runId, sourceId, status: 'skipped', startedAt, completedAt: startedAt, cursor: await store.getSourceCursor(sourceId), counts: resultCounts(), durability: store.describeDurability(), auditId: null };
    }
    if (!force && previousState.lastSuccessAt && Date.parse(startedAt) - Date.parse(previousState.lastSuccessAt) < adapter.pollIntervalMs) {
      return { runId, sourceId, status: 'skipped', startedAt, completedAt: startedAt, cursor: await store.getSourceCursor(sourceId), counts: resultCounts(), durability: store.describeDurability(), auditId: null };
    }
    await store.setSourceState(sourceId, { lastAttemptAt: startedAt });
    const counts = resultCounts();
    try {
      const cursor = await store.getSourceCursor(sourceId);
      const providerResult = await adapter.fetchChanges({ cursor, runId });
      const capturedAt = timestamp(now);
      const seenExternalIds = new Set();
      if (providerResult.status === 'success') {
        for (const record of providerResult.records ?? []) {
          const observation = createSourceObservation({ ...record.observationInput, ingestionRunId: runId }, { capturedAt });
          const inserted = await store.insertObservation(observation);
          if (!inserted.created) {
            counts.unchanged += 1;
            seenExternalIds.add(observation.externalId);
            continue;
          }
          const draft = normalizeIncidentDraft(record.incidentDraft);
          seenExternalIds.add(draft.externalId);
          const decision = evaluatePublication({
            providerTier: observation.providerTier,
            independentSourceCount: draft.independentSourceCount ?? 1,
            locationPrecision: draft.locationPrecision,
            locationConfidence: draft.locationPrecision === 'unknown' ? 0 : 1,
            severity: draft.severity,
            contradictions: false,
            valid: observation.validationState === 'valid',
          });
          await store.setObservationDecision(observation.id, decision);
          if (!decision.canAffectRisk) {
            counts[decision.publicationState] = (counts[decision.publicationState] ?? 0) + 1;
            continue;
          }
          const sourceKey = `${draft.provider}:${draft.externalId}`;
          const existing = await store.findIncidentBySource(sourceKey);
          if (!existing && ['resolving', 'resolved', 'retracted'].includes(draft.status)) {
            counts.review += 1;
            continue;
          }
          const next = canonicalIncident({ draft, observation, decision, existing, capturedAt });
          const changedFields = existing ? materialFields(existing, next) : ['status', 'severity', 'summary', 'sourceUpdatedAt'];
          if (existing && changedFields.length === 0) {
            await store.touchIncident({ incidentId: existing.id, lastObservedAt: capturedAt, sourceUpdatedAt: observation.sourceUpdatedAt, at: capturedAt });
            counts.unchanged += 1;
            continue;
          }
          await store.applyIncidentMutation({
            observationId: observation.id, sourceKey, expectedVersion: existing?.currentVersion ?? 0, incident: next, changedFields,
            reason: existing ? 'official-source-updated' : 'official-source-created', policyVersion: decision.policyVersion,
            riskPolicyVersion: LIVE_RISK_POLICY_VERSION, at: capturedAt,
          });
          if (existing) counts.updated += 1;
          else counts.created += 1;
        }
        if (providerResult.fullSnapshot === true) {
          const reconciliation = await store.resolveMissingSourceIncidents({
            sourceId, fullSnapshot: true, succeeded: true, seenExternalIds, at: capturedAt,
          });
          counts.resolved += reconciliation.resolvedCount;
        }
      }
      if (providerResult.status === 'success' || providerResult.status === 'not-modified') {
        await store.setSourceCursor(sourceId, providerResult.cursor ?? {});
      }
      const completedAt = timestamp(now);
      await store.setSourceState(sourceId, {
        state: ['success', 'not-modified'].includes(providerResult.status) ? 'healthy' : 'failed',
        lastSuccessAt: ['success', 'not-modified'].includes(providerResult.status) ? completedAt : previousState.lastSuccessAt,
        sourceWatermark: providerResult.sourceWatermark ?? null, httpStatus: providerResult.httpStatus ?? null,
        latencyMs: providerResult.latencyMs ?? null, counts: providerResult.counts ?? {},
      });
      const audit = await store.recordAuditEvent({ type: 'live-ingestion-run', sourceId, runId, requestedBy, status: providerResult.status, at: completedAt, counts });
      return { runId, sourceId, status: providerResult.status, startedAt, completedAt, cursor: providerResult.cursor ?? null, counts, durability: store.describeDurability(), auditId: audit.id };
    } catch (error) {
      const completedAt = timestamp(now);
      const state = previousState.lastSuccessAt ? 'stale' : 'failed';
      await store.setSourceState(sourceId, { state, httpStatus: null, latencyMs: null });
      const audit = await store.recordAuditEvent({ type: 'live-ingestion-run', sourceId, runId, requestedBy, status: 'failed', at: completedAt, counts });
      logger?.warn?.('Live source ingestion failed', { sourceId, code: 'LIVE_SOURCE_FETCH_FAILED' });
      return { runId, sourceId, status: 'failed', startedAt, completedAt, cursor: null, counts, durability: store.describeDurability(), auditId: audit.id, error: { code: 'LIVE_SOURCE_FETCH_FAILED', sourceId } };
    }
  }

  return Object.freeze({
    run(request) {
      if (!request || typeof request.sourceId !== 'string') return Promise.reject(new TypeError('sourceId is required'));
      if (running.has(request.sourceId)) return running.get(request.sourceId);
      const promise = execute(request).finally(() => running.delete(request.sourceId));
      running.set(request.sourceId, promise);
      return promise;
    },
    getRunningSources() {
      return [...running.keys()].sort();
    },
  });
}
