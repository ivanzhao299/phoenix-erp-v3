'use client';
import { useEffect, useRef, useState } from 'react';

export interface KioskGuardOptions {
  /** 管理员豁免：true 时所有 kiosk 行为关闭 */
  isAdmin: boolean;
  /** PWA manifest 路径：进入时切换；退出时恢复原 manifest */
  manifestHref?: string;
  /** 路由囚禁：非管理员浏览器后退/popstate 时跳回此路径 */
  trapPath?: string;
  /** 系统打印对话框期间不重新请求全屏（由外部 setter 控制） */
  isPrinting?: boolean;
}

export interface KioskGuardState {
  isFullscreen: boolean;
  requestFullscreen: () => void;
}

/**
 * KIOSK 终端综合防护 hook：
 * 1. 自动请求全屏 + 退出全屏后 100ms 内重锁（Re-Lock）
 * 2. F5 / F11 / Ctrl+R / Ctrl+W / Ctrl+T / Ctrl+L 全部 preventDefault
 * 3. popstate 强制 nav 回 trapPath；beforeunload 弹原生确认
 * 4. 进入时切换 manifest 以获得 PWA 全屏 landscape；退出时恢复
 *
 * 调用方仍需要：
 *   - 自己处理 beforeprint/afterprint 来通过 isPrinting 暂停 Re-Lock
 *   - 自己渲染全屏遮罩（!isAdmin && !isFullscreen 时覆盖屏幕）
 */
export function useKioskGuard(opts: KioskGuardOptions): KioskGuardState {
  const { isAdmin, manifestHref, trapPath, isPrinting } = opts;
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => (typeof document !== 'undefined' ? !!document.fullscreenElement : false),
  );
  const isPrintingRef = useRef<boolean | undefined>(isPrinting);
  useEffect(() => { isPrintingRef.current = isPrinting; }, [isPrinting]);

  // ── 1. Manifest 切换（进入时换 packaging-manifest.json；退出还原） ──
  useEffect(() => {
    if (!manifestHref) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const originalHref = link.href;
    link.href = manifestHref;
    return () => {
      if (originalHref) link.href = originalHref;
    };
  }, [manifestHref]);

  // ── 2. 全屏 + Re-Lock ──
  useEffect(() => {
    const onChange = () => {
      const full = !!document.fullscreenElement;
      setIsFullscreen(full);
      if (!isAdmin && !full && !isPrintingRef.current) {
        setTimeout(() => {
          document.documentElement.requestFullscreen().catch(() => {});
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    // 初次挂载请求全屏（非管理员）
    if (!isAdmin && !document.fullscreenElement) {
      // 浏览器要求 fullscreen 由用户手势触发；首次会被拒绝，遮罩点击后重试
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [isAdmin]);

  // ── 3. 路由囚禁 + beforeunload ──
  useEffect(() => {
    if (isAdmin || !trapPath) return;
    const onPopState = () => {
      window.history.pushState(null, '', trapPath);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // 推一个 history entry 让 popstate 至少有 1 步可拦
    window.history.pushState(null, '', trapPath);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isAdmin, trapPath]);

  // ── 4. 系统快捷键拦截（捕获相 capture:true 最先响应）──
  useEffect(() => {
    if (isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inForm = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (inForm) return;
      const isMeta = e.ctrlKey || e.metaKey;
      // F5 / Ctrl+R 刷新
      if (e.key === 'F5' || (isMeta && e.key === 'r')) { e.preventDefault(); return; }
      // F11 全屏切换
      if (e.key === 'F11') { e.preventDefault(); return; }
      // Ctrl+W / Cmd+W 关闭标签
      if (isMeta && e.key === 'w') { e.preventDefault(); return; }
      // Ctrl+T / Cmd+T 新建标签
      if (isMeta && e.key === 't') { e.preventDefault(); return; }
      // Ctrl+L / Cmd+L 聚焦地址栏
      if (isMeta && e.key === 'l') { e.preventDefault(); return; }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [isAdmin]);

  const requestFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {});
  };

  return { isFullscreen, requestFullscreen };
}
