export async function mapSettledWithConcurrency(items, concurrency, mapper) {
  const safeItems = Array.isArray(items) ? items : [];
  const workerCount = Math.max(1, Math.min(safeItems.length || 1, Math.floor(Number(concurrency) || 1)));
  const results = new Array(safeItems.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < safeItems.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          status: 'fulfilled',
          value: await mapper(safeItems[index], index),
        };
      } catch (reason) {
        results[index] = {
          status: 'rejected',
          reason,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
