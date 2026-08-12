export class WatchlistStoreError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'WatchlistStoreError';
    this.status = status;
    this.code = code;
  }
}

function createHeaders(serviceRoleKey, extraHeaders = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders,
  };
}

function encodeFilter(value) {
  return encodeURIComponent(`eq.${value}`);
}

async function parseJson(response) {
  return response.json().catch(() => null);
}

function mapWatchedPlace(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    label: row.label,
    postcode: row.postcode,
    normalizedPostcode: row.normalized_postcode,
    lastCheckedMonth: row.last_checked_month ?? null,
    lastSnapshot: row.last_snapshot ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function normalizeLabel(value) {
  return String(value || '').trim();
}

function validateLabel(value) {
  const label = normalizeLabel(value);

  if (label.length < 1 || label.length > 40) {
    throw new WatchlistStoreError(
      'Watched place labels must be between 1 and 40 characters.',
      400,
      'INVALID_WATCH_LABEL',
    );
  }

  return label;
}

function validateWatchId(value) {
  const id = String(value || '').trim();

  if (!id) {
    throw new WatchlistStoreError('Watched place not found.', 404, 'WATCH_NOT_FOUND');
  }

  return id;
}

export function normalizeWatchedPostcode(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '');

  if (!compact) {
    return '';
  }

  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/i.test(compact)) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }

  return compact;
}

export function createWatchlistStore(config, fetchImpl = fetch) {
  async function request(path, options = {}) {
    const response = await fetchImpl(`${config.supabaseUrl}${path}`, options);

    if (!response.ok) {
      const body = await parseJson(response);
      const message = body?.message || body?.error || 'Supabase watchlist request failed.';

      if (response.status === 409 && (body?.code === '23505' || /duplicate/i.test(message))) {
        throw new WatchlistStoreError('That postcode is already in your watchlist.', 409, 'DUPLICATE_WATCH');
      }

      if (/WATCH_LIMIT_REACHED/i.test(message)) {
        throw new WatchlistStoreError('You have reached the 10-place watchlist limit.', 409, 'WATCH_LIMIT_REACHED');
      }

      throw new WatchlistStoreError(message, response.status, body?.code || null);
    }

    return parseJson(response);
  }

  async function getSingle(path, method, body = null) {
    const rows = await request(path, {
      method,
      headers: createHeaders(config.supabaseServiceRoleKey, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: body ? JSON.stringify(body) : undefined,
    });

    const row = Array.isArray(rows) ? rows[0] ?? null : rows;
    if (!row) {
      throw new WatchlistStoreError('Watched place not found.', 404, 'WATCH_NOT_FOUND');
    }

    return mapWatchedPlace(row);
  }

  return {
    async list(userId) {
      const rows = await request(
        `/rest/v1/watched_places?user_id=${encodeFilter(userId)}&order=created_at.asc`,
        {
          method: 'GET',
          headers: createHeaders(config.supabaseServiceRoleKey),
        },
      );

      return Array.isArray(rows) ? rows.map(mapWatchedPlace) : [];
    },

    async create(userId, input) {
      const label = validateLabel(input?.label);
      const postcode = normalizeWatchedPostcode(input?.postcode);

      return getSingle('/rest/v1/watched_places', 'POST', {
        user_id: userId,
        label,
        postcode,
        normalized_postcode: postcode,
      });
    },

    async update(userId, id, input) {
      const watchId = validateWatchId(id);
      const label = validateLabel(input?.label);

      return getSingle(
        `/rest/v1/watched_places?id=${encodeFilter(watchId)}&user_id=${encodeFilter(userId)}`,
        'PATCH',
        { label },
      );
    },

    async remove(userId, id) {
      const watchId = validateWatchId(id);

      await getSingle(
        `/rest/v1/watched_places?id=${encodeFilter(watchId)}&user_id=${encodeFilter(userId)}`,
        'DELETE',
      );

      return { id: watchId };
    },

    async saveSnapshot(userId, id, { dataMonth, snapshot }) {
      const watchId = validateWatchId(id);

      return getSingle(
        `/rest/v1/watched_places?id=${encodeFilter(watchId)}&user_id=${encodeFilter(userId)}`,
        'PATCH',
        {
          last_checked_month: String(dataMonth || '').trim() || null,
          last_snapshot: snapshot ?? null,
        },
      );
    },
  };
}
