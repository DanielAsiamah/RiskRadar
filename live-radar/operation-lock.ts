let operationTail: Promise<void> = Promise.resolve();

export interface LiveRadarOperationEpoch {
  advance(): number;
  capture(): number;
  isCurrent(token: number): boolean;
}

export function createLiveRadarOperationEpoch(): LiveRadarOperationEpoch {
  let current = 0;

  return {
    advance() {
      current += 1;
      return current;
    },
    capture() {
      return current;
    },
    isCurrent(token) {
      return token === current;
    },
  };
}

interface PersistLiveRadarOperationOptions<T> {
  epoch: LiveRadarOperationEpoch;
  token: number;
  value: T;
  apply(value: T): void;
  write(value: T): Promise<void>;
  getCurrent(): T;
}

export async function persistLiveRadarOperation<T>({
  epoch,
  token,
  value,
  apply,
  write,
  getCurrent,
}: PersistLiveRadarOperationOptions<T>): Promise<boolean> {
  if (!epoch.isCurrent(token)) return false;

  apply(value);
  await write(value);
  if (epoch.isCurrent(token)) return true;

  // A shutdown can happen while storage is writing. Re-commit the latest state
  // so stale scan or startup work cannot resurrect monitoring on reload.
  await write(getCurrent());
  return false;
}

export function runLiveRadarExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation, operation);
  operationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
