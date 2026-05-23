/**
 * haptic.ts — 触觉反馈工具
 *
 * 用法：
 *   import { haptic } from '@/lib/haptic';
 *   haptic('light');    // 普通点击
 *   haptic('success');  // 操作成功
 *   haptic('error');    // 操作失败
 *
 * 兼容性：
 *   Android Chrome：原生支持 navigator.vibrate
 *   iOS Safari 16+：部分支持（轻震感）
 *   桌面浏览器：静默降级，不报错
 */

type HapticType = 'light' | 'success' | 'error' | 'warning';

const PATTERNS: Record<HapticType, number | number[]> = {
  light:   10,            // 单次 10ms — 普通按钮点击
  success: [10, 60, 20],  // 短-停-短 — 操作成功
  error:   [30, 30, 30],  // 长-停-长 — 操作失败
  warning: [20, 40, 20],  // 中-停-中 — 警告
};

export function haptic(type: HapticType = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(PATTERNS[type]);
    }
  } catch {
    // 静默降级
  }
}
