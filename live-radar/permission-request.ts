export async function runPermissionRequest<T>(
  request: () => Promise<unknown>,
  readSnapshot: () => Promise<T>,
): Promise<T> {
  try {
    await request();
  } catch {
    // The refreshed OS snapshot is the source of truth after a failed prompt.
  }
  return readSnapshot();
}
