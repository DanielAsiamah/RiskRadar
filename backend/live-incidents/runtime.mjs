import { createEnvironmentAgencyAdapter } from './adapters/environment-agency.mjs';
import { createTflAdapter } from './adapters/tfl.mjs';

function configuredKey(env, name) {
  return typeof env?.[name] === 'string' ? env[name].trim() : '';
}

export function createConfiguredLiveAdapters(env = {}, options = {}) {
  const adapters = [createEnvironmentAgencyAdapter(options.environmentAgency)];
  const tflAppKey = configuredKey(env, 'TFL_APP_KEY');
  if (tflAppKey) {
    adapters.push(createTflAdapter({ ...options.tfl, appKey: tflAppKey }));
  }
  return Object.freeze(adapters);
}

export function startLiveIngestionPolling({
  adapters,
  ingestionService,
  logger = console,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  if (!Array.isArray(adapters)) throw new TypeError('adapters must be an array');
  if (!ingestionService || typeof ingestionService.run !== 'function') throw new TypeError('ingestionService is required');
  const timers = [];

  for (const adapter of adapters) {
    if (!adapter || typeof adapter.id !== 'string' || !Number.isFinite(adapter.pollIntervalMs) || adapter.pollIntervalMs <= 0) {
      throw new TypeError('each live adapter requires an id and positive pollIntervalMs');
    }
    const poll = () => ingestionService.run({
      sourceId: adapter.id,
      requestedBy: 'server-schedule',
    }).then((result) => {
      logger?.info?.(`RiskRadar live source poll: ${result.sourceId} ${result.status}`);
      return result;
    }).catch(() => {
      logger?.warn?.('RiskRadar live source poll failed', { sourceId: adapter.id, code: 'LIVE_SOURCE_POLL_FAILED' });
      return null;
    });
    void poll();
    const timer = setIntervalImpl(poll, adapter.pollIntervalMs);
    timer?.unref?.();
    timers.push(timer);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearIntervalImpl(timer);
  };
}
