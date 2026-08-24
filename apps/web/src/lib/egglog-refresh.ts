import { mobileApi, type FlockRecord } from './mobile-api';

export const EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

export async function loadEgglogFlocks(): Promise<FlockRecord[]> {
  const res = await mobileApi.getFlocks();
  const arr: FlockRecord[] = Array.isArray(res) ? res : (res as any)?.data ?? [];
  return arr.sort((a, b) => (a.house_code || a.flock_no).localeCompare(b.house_code || b.flock_no));
}

interface VisibilityRefreshOptions {
  refreshFlocks: () => void | Promise<void>;
  refreshLogs: () => void | Promise<void>;
  getLastLogLoadedAt: () => number;
  now?: () => number;
  documentTarget?: Document;
}

export function registerEgglogVisibilityRefresh({
  refreshFlocks,
  refreshLogs,
  getLastLogLoadedAt,
  now = Date.now,
  documentTarget = document,
}: VisibilityRefreshOptions): () => void {
  let lastForegroundRefreshAt = 0;

  const onVisibilityChange = () => {
    if (documentTarget.visibilityState !== 'visible') return;

    const currentTime = now();
    if (
      lastForegroundRefreshAt > 0
      && currentTime - lastForegroundRefreshAt < EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS
    ) return;

    // A minute suppresses rapid app-switch bursts while keeping resumed data timely.
    lastForegroundRefreshAt = currentTime;
    void refreshFlocks();
    if (currentTime - getLastLogLoadedAt() >= EGGLOG_FOREGROUND_REFRESH_INTERVAL_MS) {
      void refreshLogs();
    }
  };

  documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  return () => documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
}
