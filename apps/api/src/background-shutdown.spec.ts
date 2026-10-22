import { installBackgroundShutdown } from './background-shutdown';

describe('background shutdown ordering', () => {
  it('waits for drain before disposing domain resources, including manual close', async () => {
    let settle!: () => void;
    const tasks = { shutdown: jest.fn(() => new Promise<void>(r => { settle = r; })) };
    const close = jest.fn(async () => undefined);
    const app = { close };
    const signals = { once: jest.fn() };
    installBackgroundShutdown(app, tasks, signals as unknown as NodeJS.Process);
    const pending = app.close();
    expect(close).not.toHaveBeenCalled();
    expect(app.close()).toBe(pending);
    settle(); await pending;
    expect(close).toHaveBeenCalledTimes(1);
    expect(tasks.shutdown).toHaveBeenCalledWith(3000);
  });
  it('a drain failure emits exactly one HOLD marker, preserves the error and disposes nothing', async () => {
    const close = jest.fn(async () => undefined);
    const marker = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const app = { close };
      installBackgroundShutdown(app, { shutdown: jest.fn(async () => { throw new Error('HOLD'); }) }, { once: jest.fn() } as unknown as NodeJS.Process);
      await expect(app.close()).rejects.toThrow('HOLD');
      await expect(app.close()).rejects.toThrow('HOLD');
      expect(marker.mock.calls.filter(call => call[0] === 'BACKGROUND_SHUTDOWN_HOLD')).toHaveLength(1);
      expect(close).not.toHaveBeenCalled();
    } finally { marker.mockRestore(); }
  });
  it('a signal-level drain failure stays fenced and never exits the process on its own', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('UNEXPECTED_EXIT'); }) as never as typeof process.exit);
    const marker = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers: Record<string, () => void> = {};
    const signals = { once: (signal: string, handler: () => void) => { handlers[signal] = handler; } };
    const close = jest.fn(async () => undefined);
    const app = { close };
    try {
      installBackgroundShutdown(app, { shutdown: jest.fn(async () => { throw new Error('HOLD'); }) }, signals as unknown as NodeJS.Process);
      handlers.SIGTERM();
      await new Promise(resolve => setImmediate(resolve));
      expect(exit).not.toHaveBeenCalled();
      expect(marker.mock.calls.filter(call => call[0] === 'BACKGROUND_SHUTDOWN_HOLD')).toHaveLength(1);
      expect(close).not.toHaveBeenCalled();
    } finally { exit.mockRestore(); marker.mockRestore(); }
  });
});
