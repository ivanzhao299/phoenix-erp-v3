/**
 * Phoenix ERP V3 — UI Utilities
 * ==============================
 * cn(): Tailwind class 合并工具（clsx + tailwind-merge）
 * 用法：className={cn('base-class', condition && 'conditional-class', props.className)}
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
