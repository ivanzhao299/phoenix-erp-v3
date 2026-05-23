import { useEffect, useRef, useCallback } from 'react';

/**
 * usePolling — 带 Page Visibility API 的智能轮询 hook
 *
 * 解决的问题：
 *   旧的 setInterval 在浏览器标签切到后台时仍全速运行，持续消耗 CPU + 发起 API 请求。
 *   Page Visibility API 让我们在标签不可见时跳过请求，标签切回来时立即补一次请求。
 *
 * 使用方法：
 *   usePolling(fetchData, 30_000);   // 每 30s 轮询，后台时暂停
 *
 * @param fn     轮询执行的函数（请用 useCallback 包裹，保证引用稳定）
 * @param ms     轮询间隔（毫秒）
 * @param eager  是否立即执行第一次（默认 true）
 */
export function usePolling(
  fn: () => void,
  ms: number,
  eager = true,
): void {
  // 用 ref 存函数，避免 interval 回调闭包捕获旧的 fn 引用
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // 记录上次执行时间，标签切回来时判断是否需要补跑一次
  const lastRunRef = useRef<number>(0);

  const run = useCallback(() => {
    fnRef.current();
    lastRunRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (eager) run();

    const id = setInterval(() => {
      // 标签在后台时跳过，节省 CPU 和 API 请求
      if (document.hidden) return;
      run();
    }, ms);

    // 标签切回来时：若距离上次执行已超过间隔，立即补跑一次
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRunRef.current >= ms) {
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [run, ms, eager]);
}
