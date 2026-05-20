/**
 * useTerminalContext — Terminal 作业台全局上下文
 * 管理当前班次、当前批次、设备状态、操作人信息
 */
'use client';
import { useState, useCallback, useEffect } from 'react';
import type {
  WorkShift, SourceBatch, GradingBatch, DeviceStatus, ExceptionTicket
} from '@/types/packaging-terminal';
import { packagingApi } from '@/lib/packaging-api';

const TERMINAL_ID_KEY = 'phoenix_terminal_id';
const CONTEXT_STORAGE_KEY = 'phoenix_terminal_context';

function getOrCreateTerminalId(): string {
  if (typeof window === 'undefined') return 'terminal-ssr';
  let id = localStorage.getItem(TERMINAL_ID_KEY);
  if (!id) {
    id = `T-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    localStorage.setItem(TERMINAL_ID_KEY, id);
  }
  return id;
}

export interface PackingBatchItem {
  grade: string;
  spec: string;
  specId: string;
  boxes: number;
  eggs: number;
  materialBatch?: string;
}

export interface TerminalState {
  terminalId: string;
  currentShift: WorkShift | null;
  currentSourceBatch: SourceBatch | null;
  currentGradingBatch: GradingBatch | null;
  openExceptions: ExceptionTicket[];
  devices: DeviceStatus[];
  // 分级结果
  gradingCode: string | null;
  gradingOutputs: Record<string, number> | null;
  // 包装结果
  packingCode: string | null;
  packingBatches: PackingBatchItem[] | null;
}

// label 在展示层通过 i18n t() 翻译，此处仅存 deviceType 作为 i18n key 后缀
const DEFAULT_DEVICES: DeviceStatus[] = [
  { deviceId: 'scanner-01', deviceType: 'SCANNER',     label: 'device.scanner',     status: 'UNKNOWN' },
  { deviceId: 'printer-01', deviceType: 'PRINTER',     label: 'device.printer',     status: 'UNKNOWN' },
  { deviceId: 'scale-01',   deviceType: 'SCALE',       label: 'device.scale',       status: 'UNKNOWN' },
  { deviceId: 'grader-01',  deviceType: 'GRADER',      label: 'device.grader',      status: 'UNKNOWN' },
  { deviceId: 'agent-01',   deviceType: 'LOCAL_AGENT', label: 'device.local_agent', status: 'UNKNOWN' },
];

const INITIAL: TerminalState = {
  terminalId: '',
  currentShift: null,
  currentSourceBatch: null,
  currentGradingBatch: null,
  openExceptions: [],
  devices: DEFAULT_DEVICES,
  gradingCode: null,
  gradingOutputs: null,
  packingCode: null,
  packingBatches: null,
};

function loadFromStorage(): Partial<TerminalState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<TerminalState>;
  } catch {
    return {};
  }
}

function saveToStorage(state: TerminalState) {
  if (typeof window === 'undefined') return;
  try {
    const { terminalId, currentShift, currentSourceBatch, currentGradingBatch,
      gradingCode, gradingOutputs, packingCode, packingBatches } = state;
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify({
      terminalId, currentShift, currentSourceBatch, currentGradingBatch,
      gradingCode, gradingOutputs, packingCode, packingBatches,
    }));
  } catch {
    // ignore storage errors
  }
}

export function useTerminalContext() {
  const [state, setState] = useState<TerminalState>(INITIAL);

  useEffect(() => {
    const stored = loadFromStorage();
    setState(prev => ({
      ...prev,
      ...stored,
      terminalId: getOrCreateTerminalId(),
      // always reset devices to default on mount
      devices: DEFAULT_DEVICES,
      openExceptions: stored.openExceptions ?? [],
    }));
    // 从服务端同步今日异常（仅在有 token 时，避免新标签页触发 401 跳转）
    if (typeof window !== 'undefined' && sessionStorage.getItem('phoenix_token')) {
      packagingApi.getTodayExceptions().then((list) => {
        if (Array.isArray(list)) {
          setState(prev => ({ ...prev, openExceptions: list as ExceptionTicket[] }));
        }
      }).catch(() => { /* 离线时保留本地缓存 */ });
    }
  }, []);

  const updateState = useCallback((updater: (prev: TerminalState) => TerminalState) => {
    setState(prev => {
      const next = updater(prev);
      saveToStorage(next);
      return next;
    });
  }, []);

  const setShift = useCallback((shift: WorkShift | null) => {
    updateState(prev => ({ ...prev, currentShift: shift }));
  }, [updateState]);

  const setSourceBatch = useCallback((batch: SourceBatch | null) => {
    updateState(prev => ({ ...prev, currentSourceBatch: batch }));
  }, [updateState]);

  const setGradingBatch = useCallback((batch: GradingBatch | null) => {
    updateState(prev => ({ ...prev, currentGradingBatch: batch }));
  }, [updateState]);

  const addException = useCallback((ex: ExceptionTicket) => {
    updateState(prev => ({ ...prev, openExceptions: [...prev.openExceptions, ex] }));
  }, [updateState]);

  const updateDeviceStatus = useCallback((deviceId: string, status: DeviceStatus['status']) => {
    setState(prev => ({
      ...prev,
      devices: prev.devices.map(d => d.deviceId === deviceId ? { ...d, status } : d),
    }));
  }, []);

  const setGradingResult = useCallback((code: string, outputs: Record<string, number>) => {
    updateState(prev => ({ ...prev, gradingCode: code, gradingOutputs: outputs }));
  }, [updateState]);

  const setPackingResult = useCallback((code: string, batches: PackingBatchItem[]) => {
    updateState(prev => ({ ...prev, packingCode: code, packingBatches: batches }));
  }, [updateState]);

  const clearWorkflowState = useCallback(() => {
    updateState(prev => ({
      ...prev,
      gradingCode: null,
      gradingOutputs: null,
      packingCode: null,
      packingBatches: null,
    }));
  }, [updateState]);

  return {
    ctx: state,
    // also spread for backward compat
    ...state,
    openExceptionCount: state.openExceptions.filter(e => !['CLOSED', 'CANCELLED'].includes(e.status)).length,
    setShift,
    setSourceBatch,
    setGradingBatch,
    addException,
    updateDeviceStatus,
    setGradingResult,
    setPackingResult,
    clearWorkflowState,
  };
}
