import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useAbortableLoad — 带 AbortController 的取数 hook（性能/正确性补强 B）。
 *
 * 解决"快速切页/改筛选时旧请求晚到覆盖新数据 + 浪费带宽"：
 *  - 每次运行建一个 AbortController，把 signal 交给 loader（透传给 fetch/api-client request 的 signal）
 *  - 依赖变化或卸载时 abort 上一次请求，并忽略其结果
 *  - AbortError 不当作错误（不置 error、不弹 toast）
 *
 * loader 必须把 signal 透传到底层 fetch（`fetch(url, { signal })` 或 `request(path, { signal })`），
 * 否则只是忽略结果、请求仍跑完（仍能防"旧覆盖新"，但不省带宽）。
 */
export interface AbortableLoadState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAbortableLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  opts?: { enabled?: boolean; initial?: T },
): AbortableLoadState<T> {
  const enabled = opts?.enabled !== false;
  const [data, setData] = useState<T | undefined>(opts?.initial);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current(ctrl.signal)
      .then((d) => {
        if (active && !ctrl.signal.aborted) setData(d);
      })
      .catch((e: unknown) => {
        // 主动取消不算错误
        if (ctrl.signal.aborted || (e as { name?: string })?.name === "AbortError") return;
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active && !ctrl.signal.aborted) setLoading(false);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  return { data, loading, error, reload };
}
