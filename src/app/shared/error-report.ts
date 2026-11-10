/**
 * Hands a failure of the start-up to the host (the container or the browser) without writing to the console. It never
 * throws: when the host offers no reporter the failure is dropped, because nothing here may break the host either.
 */
export function reportFailure(error: unknown): void {
  try {
    const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
    if (typeof report === 'function') report(error);
  } catch {
    // The reporter of the host failed: there is nowhere left to report to.
  }
}
