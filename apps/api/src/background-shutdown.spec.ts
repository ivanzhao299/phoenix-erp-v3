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
    expect(tasks.shutdown).toHaveBeenCalledWith(30000);
  });
  it('never disposes resources after drain failure', async () => {
    const close = jest.fn(async () => undefined);
    const app = { close };
    installBackgroundShutdown(app, { shutdown: jest.fn(async () => { throw new Error('HOLD'); }) }, { once: jest.fn() } as unknown as NodeJS.Process);
    await expect(app.close()).rejects.toThrow('HOLD');
    expect(close).not.toHaveBeenCalled();
  });
});
