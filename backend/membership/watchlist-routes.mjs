function mapWatchlistError(error) {
  if (error?.code === 'DUPLICATE_WATCH') {
    return {
      statusCode: 409,
      payload: {
        error: error.message || 'That postcode is already in your watchlist.',
        code: 'DUPLICATE_WATCH',
      },
    };
  }

  if (error?.code === 'WATCH_LIMIT_REACHED') {
    return {
      statusCode: 409,
      payload: {
        error: error.message || 'You have reached the 10-place watchlist limit.',
        code: 'WATCH_LIMIT_REACHED',
      },
    };
  }

  if (error?.code === 'WATCH_NOT_FOUND') {
    return {
      statusCode: 404,
      payload: {
        error: error.message || 'Watched place not found.',
        code: 'WATCH_NOT_FOUND',
      },
    };
  }

  if (error?.code === 'INVALID_WATCH_LABEL') {
    return {
      statusCode: 400,
      payload: {
        error: error.message || 'Watched place labels must be between 1 and 40 characters.',
        code: 'INVALID_WATCH_LABEL',
      },
    };
  }

  return {
    statusCode: Number(error?.status) || 500,
    payload: {
      error: error?.message || 'Unexpected watchlist error.',
      code: error?.code || null,
    },
  };
}

export function createWatchlistRouteHandler({ watchlistStore }) {
  return {
    async handle(request, response, url, context) {
      if (!watchlistStore) {
        return false;
      }

      const isCollectionRoute = url.pathname === '/api/watchlist';
      const itemMatch = url.pathname.match(/^\/api\/watchlist\/([^/]+)$/);

      if (!isCollectionRoute && !itemMatch) {
        return false;
      }

      const premium = await context.requirePremium(request);
      if (premium.error) {
        context.sendJson(response, premium.error.statusCode, premium.error.payload);
        return true;
      }

      try {
        if (request.method === 'GET' && isCollectionRoute) {
          context.sendJson(response, 200, {
            watchedPlaces: await watchlistStore.list(premium.user.userId),
          });
          return true;
        }

        if (request.method === 'POST' && isCollectionRoute) {
          const body = await context.readJsonBody(request);
          const watchedPlace = await watchlistStore.create(premium.user.userId, {
            label: body.label,
            postcode: body.postcode,
          });
          context.sendJson(response, 201, { watchedPlace });
          return true;
        }

        if (!itemMatch) {
          return false;
        }

        const id = decodeURIComponent(itemMatch[1]);

        if (request.method === 'PATCH') {
          const body = await context.readJsonBody(request);
          const watchedPlace = await watchlistStore.update(premium.user.userId, id, {
            label: body.label,
          });
          context.sendJson(response, 200, { watchedPlace });
          return true;
        }

        if (request.method === 'DELETE') {
          const deleted = await watchlistStore.remove(premium.user.userId, id);
          context.sendJson(response, 200, {
            ok: true,
            deletedId: deleted.id,
          });
          return true;
        }
      } catch (error) {
        const mapped = mapWatchlistError(error);
        context.sendJson(response, mapped.statusCode, mapped.payload);
        return true;
      }

      return false;
    },
  };
}
