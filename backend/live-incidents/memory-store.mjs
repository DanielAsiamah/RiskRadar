import {
  assertIncidentTransition,
  toPublicIncident,
  toPublicVersion,
} from './contracts.mjs';
import { distanceToGeometryMetres } from './geometry.mjs';

const EPHEMERAL_DISCLOSURE = Object.freeze({
  driver: 'memory',
  durability: 'ephemeral',
  persistent: false,
  disclosure: 'Live incident history is stored in memory for local development and is cleared when the backend restarts.',
});

function clone(value) {
  return structuredClone(value);
}

function isoNow(now) {
  return now().toISOString();
}

function assertTimestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be a valid ISO timestamp`);
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
}

function sourceProviderKey(sourceDefinition, externalId) {
  return `${sourceDefinition.provider}:${externalId}`;
}

function publicStatus(incident) {
  return ['active', 'updated', 'resolving'].includes(incident.status)
    && ['published', 'preliminary'].includes(incident.publicationState);
}

function sourceStateFor(definition) {
  return {
    sourceId: definition.id,
    provider: definition.provider,
    state: definition.defaultState,
    lastAttemptAt: null,
    lastSuccessAt: null,
    sourceWatermark: null,
    httpStatus: null,
    latencyMs: null,
    counts: {},
    staleAfterMs: definition.staleAfterMs ?? null,
    disclosure: definition.disclosure ?? 'Source has not been polled in this local development session.',
  };
}

export function createMemoryLiveIncidentStore({ sourceDefinitions = [], now = () => new Date() } = {}) {
  if (!Array.isArray(sourceDefinitions)) throw new TypeError('sourceDefinitions must be an array');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const observations = new Map();
  const observationDecisions = new Map();
  const incidents = new Map();
  const incidentIdsBySourceKey = new Map();
  const versionsByIncidentId = new Map();
  const outboxByKey = new Map();
  const cursors = new Map();
  const sourceStates = new Map(sourceDefinitions.map((definition) => {
    assertObject(definition, 'source definition');
    if (typeof definition.id !== 'string' || typeof definition.provider !== 'string') {
      throw new TypeError('source definition requires id and provider');
    }
    return [definition.id, sourceStateFor(definition)];
  }));
  const sourceDefinitionsById = new Map(sourceDefinitions.map((definition) => [definition.id, clone(definition)]));
  const auditEvents = [];

  function requireSourceDefinition(sourceId) {
    const definition = sourceDefinitionsById.get(sourceId);
    if (!definition) throw new RangeError(`Unknown source: ${sourceId}`);
    return definition;
  }

  function versionForMutation(input, currentVersion) {
    const version = currentVersion + 1;
    return {
      id: `version_${input.incident.id}_${version}`,
      incidentId: input.incident.id,
      version,
      changedFields: [...input.changedFields],
      reason: input.reason,
      createdAt: input.at,
      snapshot: clone(input.incident),
      policyVersion: input.policyVersion,
      riskPolicyVersion: input.riskPolicyVersion,
    };
  }

  function outboxForVersion(version) {
    const key = `${version.incidentId}:${version.version}`;
    return {
      id: `outbox_${version.incidentId}_${version.version}`,
      uniqueKey: key,
      incidentId: version.incidentId,
      version: version.version,
      type: 'live-incident-upserted',
      createdAt: version.createdAt,
    };
  }

  return Object.freeze({
    async insertObservation(observation) {
      assertObject(observation, 'observation');
      if (typeof observation.id !== 'string' || observation.id.length === 0) throw new TypeError('observation id is required');
      if (observations.has(observation.id)) return { created: false, observation: clone(observations.get(observation.id)) };
      observations.set(observation.id, clone(observation));
      return { created: true, observation: clone(observation) };
    },

    async setObservationDecision(observationId, decision) {
      if (!observations.has(observationId)) throw new RangeError(`Unknown observation: ${observationId}`);
      assertObject(decision, 'decision');
      observationDecisions.set(observationId, clone(decision));
      return clone(decision);
    },

    async getObservation(observationId) {
      const observation = observations.get(observationId);
      return observation ? clone(observation) : null;
    },

    async findIncidentBySource(sourceKey) {
      if (typeof sourceKey !== 'string') throw new TypeError('sourceKey must be a string');
      const incidentId = incidentIdsBySourceKey.get(sourceKey);
      return incidentId ? clone(incidents.get(incidentId)) : null;
    },

    async listMatchCandidates() {
      return [...incidents.values()].filter((incident) => incident.status !== 'resolved' && incident.status !== 'retracted').map(clone);
    },

    async applyIncidentMutation(input) {
      assertObject(input, 'incident mutation');
      assertObject(input.incident, 'incident mutation incident');
      if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new RangeError('expectedVersion must be a non-negative integer');
      if (!Array.isArray(input.changedFields)) throw new TypeError('changedFields must be an array');
      if (typeof input.reason !== 'string' || input.reason.trim().length === 0) throw new TypeError('reason is required');
      assertTimestamp(input.at, 'at');
      const existing = incidents.get(input.incident.id);
      const currentVersion = existing?.currentVersion ?? 0;
      if (currentVersion !== input.expectedVersion) {
        throw new Error(`Incident version conflict: expected ${input.expectedVersion}, received ${currentVersion}`);
      }
      if (existing) assertIncidentTransition(existing.status, input.incident.status);
      const nextVersion = currentVersion + 1;
      if (input.incident.currentVersion !== nextVersion) {
        throw new Error(`incident currentVersion must equal ${nextVersion}`);
      }
      const version = versionForMutation(input, currentVersion);
      const outbox = outboxForVersion(version);
      if (outboxByKey.has(outbox.uniqueKey)) throw new Error(`Duplicate outbox event: ${outbox.uniqueKey}`);
      toPublicIncident(input.incident);
      toPublicVersion(version);

      // All validation is complete before mutating any collection.
      const nextIncident = clone(input.incident);
      incidents.set(nextIncident.id, nextIncident);
      for (const key of nextIncident.sourceKeys ?? [input.sourceKey]) incidentIdsBySourceKey.set(key, nextIncident.id);
      versionsByIncidentId.set(nextIncident.id, [...(versionsByIncidentId.get(nextIncident.id) ?? []), version]);
      outboxByKey.set(outbox.uniqueKey, outbox);
      return { created: !existing, incident: clone(nextIncident), version: clone(version), outbox: clone(outbox) };
    },

    async touchIncident({ incidentId, lastObservedAt, sourceUpdatedAt, at = isoNow(now) }) {
      const existing = incidents.get(incidentId);
      if (!existing) return { touched: false, incident: null };
      assertTimestamp(lastObservedAt, 'lastObservedAt');
      assertTimestamp(sourceUpdatedAt, 'sourceUpdatedAt');
      assertTimestamp(at, 'at');
      const next = { ...existing, lastObservedAt, sourceUpdatedAt, updatedAt: at };
      incidents.set(incidentId, next);
      return { touched: true, incident: clone(next) };
    },

    async resolveMissingSourceIncidents({ sourceId, fullSnapshot, succeeded, seenExternalIds, at = isoNow(now) }) {
      const definition = requireSourceDefinition(sourceId);
      if (fullSnapshot !== true || succeeded !== true) return { resolvedCount: 0, incidentIds: [] };
      if (!(seenExternalIds instanceof Set)) throw new TypeError('seenExternalIds must be a Set');
      assertTimestamp(at, 'at');
      const resolved = [];
      for (const existing of incidents.values()) {
        if (existing.provider !== definition.provider || !['active', 'updated', 'resolving'].includes(existing.status)) continue;
        const externalId = (existing.sourceKeys ?? []).map((key) => key.split(':').slice(1).join(':')).find(Boolean);
        if (!externalId || seenExternalIds.has(externalId)) continue;
        const next = { ...existing, status: 'resolved', resolvedAt: at, updatedAt: at, currentVersion: existing.currentVersion + 1 };
        const version = {
          id: `version_${next.id}_${next.currentVersion}`,
          incidentId: next.id,
          version: next.currentVersion,
          changedFields: ['status', 'resolvedAt'],
          reason: 'provider-snapshot-removed',
          createdAt: at,
          snapshot: clone(next),
          policyVersion: 'live-publication-v1',
          riskPolicyVersion: 'live-risk-v1',
        };
        const outbox = outboxForVersion(version);
        incidents.set(next.id, next);
        versionsByIncidentId.set(next.id, [...(versionsByIncidentId.get(next.id) ?? []), version]);
        outboxByKey.set(outbox.uniqueKey, outbox);
        resolved.push(next.id);
      }
      return { resolvedCount: resolved.length, incidentIds: resolved };
    },

    async getIncident(incidentId) {
      const incident = incidents.get(incidentId);
      return incident ? clone(incident) : null;
    },

    async listPublicIncidents({ point, radiusKm, limit, calculatedAt }) {
      if (typeof radiusKm !== 'number' || !Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 50) throw new RangeError('radiusKm must be from 0.1 to 50');
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be an integer from 1 to 100');
      assertTimestamp(calculatedAt, 'calculatedAt');
      const radiusMetres = radiusKm * 1_000;
      return [...incidents.values()]
        .filter((incident) => publicStatus(incident) && Date.parse(incident.expiresAt) > Date.parse(calculatedAt))
        .map((incident) => ({ incident, distanceMetres: distanceToGeometryMetres(point, incident.geometry) }))
        .filter(({ incident, distanceMetres }) => distanceMetres <= radiusMetres + incident.affectedRadiusMetres)
        .sort((left, right) => right.incident.severity - left.incident.severity
          || left.distanceMetres - right.distanceMetres
          || Date.parse(right.incident.sourceUpdatedAt) - Date.parse(left.incident.sourceUpdatedAt))
        .slice(0, limit)
        .map(({ incident, distanceMetres }) => ({ ...clone(toPublicIncident(incident)), distanceMetres: Math.round(distanceMetres) }));
    },

    async listPublicVersions(incidentId) {
      return (versionsByIncidentId.get(incidentId) ?? []).map((version) => toPublicVersion(version));
    },

    async listPublicEvidence() {
      return [];
    },

    async getSourceCursor(sourceId) {
      return cursors.has(sourceId) ? clone(cursors.get(sourceId)) : null;
    },

    async setSourceCursor(sourceId, cursor) {
      requireSourceDefinition(sourceId);
      assertObject(cursor, 'cursor');
      cursors.set(sourceId, clone(cursor));
      return clone(cursor);
    },

    async getSourceState(sourceId) {
      requireSourceDefinition(sourceId);
      return clone(sourceStates.get(sourceId));
    },

    async listSourceStates() {
      return [...sourceStates.values()].map(clone);
    },

    async setSourceState(sourceId, patch) {
      requireSourceDefinition(sourceId);
      assertObject(patch, 'source state patch');
      const next = { ...sourceStates.get(sourceId), ...clone(patch), sourceId };
      sourceStates.set(sourceId, next);
      return clone(next);
    },

    async recordAuditEvent(event) {
      assertObject(event, 'audit event');
      const recorded = { id: `audit_${auditEvents.length + 1}`, ...clone(event) };
      auditEvents.push(recorded);
      return clone(recorded);
    },

    async listAuditEvents() {
      return auditEvents.map(clone);
    },

    async listOutboxEvents() {
      return [...outboxByKey.values()].map(clone);
    },

    describeDurability() {
      return clone(EPHEMERAL_DISCLOSURE);
    },
  });
}
