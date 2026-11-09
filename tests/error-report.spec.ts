import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportFailure } from '../src/app/shared/error-report';

describe('reportFailureNeverThrowsAndNeverWritesToTheConsole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hands the error to the host through reportError when the host offers it', () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    const failure = new Error('boom');

    reportFailure(failure);

    expect(report).toHaveBeenCalledWith(failure);
  });

  it('does nothing when the host has no reportError', () => {
    vi.stubGlobal('reportError', undefined);
    expect(() => reportFailure(new Error('boom'))).not.toThrow();
  });

  it('does not throw when the host reporter itself throws', () => {
    vi.stubGlobal('reportError', () => {
      throw new Error('reporter down');
    });
    expect(() => reportFailure(new Error('boom'))).not.toThrow();
  });

  it('never calls the console', () => {
    const spies = (['error', 'log', 'warn'] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => undefined));
    vi.stubGlobal('reportError', undefined);

    reportFailure(new Error('boom'));

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
