export interface LiveIncidentRefreshOperation {
  signal: AbortSignal;
  isCurrent(): boolean;
}

export interface LiveIncidentRefreshCoordinator {
  start(): LiveIncidentRefreshOperation;
  cancel(): void;
}

export function createLiveIncidentRefreshCoordinator(): LiveIncidentRefreshCoordinator {
  let generation = 0;
  let activeController: AbortController | null = null;

  return {
    start() {
      activeController?.abort();
      const controller = new AbortController();
      const operationGeneration = ++generation;
      activeController = controller;
      return {
        signal: controller.signal,
        isCurrent: () => operationGeneration === generation && !controller.signal.aborted,
      };
    },
    cancel() {
      generation += 1;
      activeController?.abort();
      activeController = null;
    },
  };
}
