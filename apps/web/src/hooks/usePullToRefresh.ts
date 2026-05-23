'use client';
import { useRef, useCallback } from 'react';
import { haptic } from '@/lib/haptic';

/**
 * usePullToRefresh — 下拉刷新手势 hook
 *
 * 在页面顶部（scrollY === 0）向下滑动 ≥ threshold px 触发 onRefresh。
 * 配合触觉反馈，让用户感知刷新已触发。
 *
 * 用法：
 *   const { pullHandlers } = usePullToRefresh(loadData);
 *   <div {...pullHandlers}>...内容...</div>
 *
 * 注意：仅对触屏设备生效，桌面浏览器下无任何副作用。
 */
export function usePullToRefresh(
  onRefresh: () => void,
  threshold = 75,
) {
  const startY   = useRef(0);
  const pulling  = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // 只在页面顶部才开始追踪
    const el = (e.currentTarget as HTMLElement).closest('[data-scroll-root]') as HTMLElement | null;
    const scrollTop = el ? el.scrollTop : window.scrollY;
    if (scrollTop <= 0) {
      startY.current  = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    pulling.current = false;
    const delta = e.changedTouches[0].clientY - startY.current;
    if (delta >= threshold) {
      haptic('light');
      onRefresh();
    }
  }, [onRefresh, threshold]);

  const onTouchCancel = useCallback(() => {
    pulling.current = false;
  }, []);

  return {
    pullHandlers: { onTouchStart, onTouchEnd, onTouchCancel } as const,
  };
}
