export function localApiEnvironment(env) {
  if (env.NODE_ENV === 'production') throw new Error('Local development access cannot run in production. Use npm run api.');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return {
    ...env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(port),
    ROUTE_PROVIDER: 'free-osm',
    ROUTE_GUARD_LOCAL_DEVELOPMENT: 'true',
    WEB_APP_ENABLED: 'true',
  };
}
