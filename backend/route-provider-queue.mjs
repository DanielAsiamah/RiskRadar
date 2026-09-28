export function createRouteProviderQueue({
  intervalMs = 1100,
  maxPending = 3,
  now = () => performance.now(),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  let tail = Promise.resolve();
  let pending = 0;
  let lastStarted = -Infinity;

  return (task) => {
    if (pending >= maxPending) {
      return Promise.reject(Object.assign(new Error('Free routing is busy. Please retry shortly.'), {
        code: 'ROUTE_PROVIDER_BUSY',
        statusCode: 503,
      }));
    }
    pending += 1;
    const result = tail.then(async () => {
      const delay = Math.max(0, intervalMs - (now() - lastStarted));
      if (delay > 0) await sleep(delay);
      lastStarted = now();
      return task();
    }).finally(() => { pending -= 1; });
    // A failed upstream request must not block the next queued journey.
    tail = result.catch(() => undefined);
    return result;
  };
}
