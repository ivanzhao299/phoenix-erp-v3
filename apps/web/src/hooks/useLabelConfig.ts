/**
 * useLabelConfig — 统一标签配置 Hook
 * 两处使用：包装作业终端（terminal）+ 独立标签补打页（label-print）
 * 统一 localStorage key，字段取两者并集，杜绝配置割裂。
 */
'use client';
import { useState, useCallback } from 'react';

export type LabelLang = 'zh' | 'lo' | 'en';

export interface LabelConfig {
  // 字段显示
  showBatch: boolean;    // 显示批次号
  showDate: boolean;     // 显示生产日期
  showExpiry: boolean;   // 显示食用期
  showPrice: boolean;    // 显示零售价
  showQr: boolean;       // 显示 QR 追溯码

  // 标签尺寸（mm）
  labelW: number;
  labelH: number;

  // 语言
  lang: LabelLang;

  // 打印机（终端用）
  printerName: string;
}

const STORAGE_KEY = 'phoenix_label_config';

const DEFAULTS: LabelConfig = {
  showBatch: true,
  showDate: true,
  showExpiry: true,
  showPrice: false,
  showQr: true,
  labelW: 40,
  labelH: 30,
  lang: 'lo',
  printerName: '',
};

// 标签尺寸预设
export const LABEL_SIZE_PRESETS = [
  { label: '40×30mm（标准）', w: 40, h: 30 },
  { label: '60×40mm（中号）', w: 60, h: 40 },
  { label: '80×50mm（大号）', w: 80, h: 50 },
  { label: '50×25mm（条码）', w: 50, h: 25 },
];

function load(): LabelConfig {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    // 兼容旧 key 迁移
    const oldTerminal = localStorage.getItem('phoenix_label_settings');
    const oldPrint    = localStorage.getItem('phoenix_label_template');
    const current     = localStorage.getItem(STORAGE_KEY);

    if (current) {
      const parsed = JSON.parse(current) as Partial<LabelConfig>;
      return { ...DEFAULTS, ...parsed };
    }

    // 首次：从旧 key 合并迁移
    const t = oldTerminal ? (JSON.parse(oldTerminal) as Record<string, unknown>) : {};
    const p = oldPrint    ? (JSON.parse(oldPrint)    as Record<string, unknown>) : {};
    const merged: LabelConfig = {
      showBatch:   (t.showBatch  ?? p.showBatchNo ?? DEFAULTS.showBatch)  as boolean,
      showDate:    (t.showDate   ?? p.showMfgDate ?? DEFAULTS.showDate)   as boolean,
      showExpiry:  (t.showExpiry ?? p.showExpiry  ?? DEFAULTS.showExpiry) as boolean,
      showPrice:   (t.showPrice  ?? p.showPrice   ?? DEFAULTS.showPrice)  as boolean,
      showQr:      (p.showQr     ?? DEFAULTS.showQr)                       as boolean,
      labelW:      (p.labelW     ?? DEFAULTS.labelW)                       as number,
      labelH:      (p.labelH     ?? DEFAULTS.labelH)                       as number,
      lang:        ((t.lang      ?? p.lang        ?? DEFAULTS.lang) as LabelLang),
      printerName: (t.printerName ?? DEFAULTS.printerName)                 as string,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export function useLabelConfig() {
  const [cfg, setCfgState] = useState<LabelConfig>(load);

  const setCfg = useCallback((patch: Partial<LabelConfig>) => {
    setCfgState(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  return { cfg, setCfg };
}
