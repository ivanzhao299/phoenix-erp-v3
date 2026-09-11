/**
 * useTerminalContext — Terminal 作业台全局上下文
 * 管理当前班次、当前批次、设备状态、操作人信息
 */
'use client';
import { createContext, createElement, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { validShiftId } from '@/lib/packaging-api';
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
  productCode?: string;
  skuCode?: string;
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

const SharedTerminalContext = createContext<ReturnType<typeof useTerminalState> | null>(null);
const VERSION = 2;

function useTerminalState() {
  const { user, loading: authLoading } = useAuth();
  const identity = user ? String(user.userId ?? user.id ?? '') : '';
  const storageKey = `${CONTEXT_STORAGE_KEY}:v${VERSION}:${identity}:real`;
  const [state, setState] = useState<TerminalState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [contextError, setContextError] = useState('');
  const generation = useRef(0);
  const [verifiedIdentity, setVerifiedIdentity] = useState('');

  const verifyShift = useCallback(async (candidate: WorkShift | null, generationId: number) => {
    if (!candidate) { setHydrated(true); return; }
    if (!validShiftId(candidate.id) || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.productionDate || '')) {
      setContextError('班次缓存无效，请重新选择班次'); setHydrated(true); return;
    }
    try {
      const raw = await packagingApi.getExactShift(String(candidate.id), candidate.productionDate);
      if (generation.current !== generationId) return;
      if (String(raw.id) !== String(candidate.id) || raw.date_text !== candidate.productionDate || raw.is_test !== false
        || !['OPEN','CLOSED'].includes(raw.status)) throw new Error('班次身份或日期不匹配，请重新选择');
      const shift = { ...candidate, id: String(raw.id), code: raw.shift_code, status: raw.status,
        productionDate: raw.date_text, lineId: raw.line_id };
      setState(prev => ({ ...prev, currentShift: shift }));
      localStorage.setItem(storageKey, JSON.stringify({ version: VERSION, userId: identity, mode: 'real', currentShift: shift }));
    } catch (error) {
      if (generation.current !== generationId) return;
      setContextError(error instanceof Error ? error.message : '班次核验失败，请重新选择');
    } finally { if (generation.current === generationId) setHydrated(true); }
  }, [identity, storageKey]);

  useEffect(() => {
    const id = ++generation.current;
    setState({ ...INITIAL, terminalId: getOrCreateTerminalId() });
    setContextError(''); setHydrated(false); setVerifiedIdentity(identity);
    if (authLoading || !identity) return;
    let candidate = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version !== VERSION || saved.userId !== identity || saved.mode !== 'real') throw new Error('cache identity');
        candidate = saved.currentShift;
      } else if (localStorage.getItem(CONTEXT_STORAGE_KEY)) {
        setContextError('旧班次缓存没有身份信息，请重新选择班次');
      }
    } catch { setContextError('班次缓存无效，请重新选择班次'); }
    void verifyShift(candidate, id);
    return () => { ++generation.current; };
  }, [identity, authLoading, storageKey, verifyShift]);

  const renderedGeneration = generation.current;
  const updateState = useCallback((updater: (prev: TerminalState) => TerminalState) => {
    if (generation.current === renderedGeneration) setState(updater);
  }, [renderedGeneration]);

  const setShift = useCallback((shift: WorkShift | null) => {
    if (generation.current !== renderedGeneration) return;
    const id = ++generation.current;
    setState(prev => ({ ...INITIAL, terminalId: prev.terminalId }));
    setContextError(''); setHydrated(false);
    localStorage.removeItem(storageKey);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`phoenix_grading_wip4_${identity}:real:`)) localStorage.removeItem(key);
    }
    void verifyShift(shift, id);
  }, [storageKey, identity, verifyShift, renderedGeneration]);

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
    hydrated: hydrated && verifiedIdentity === identity && !authLoading,
    contextError,
    identityKey: `${identity}:real`,
    ctx: verifiedIdentity === identity ? state : INITIAL,
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

export function TerminalContextProvider({ children }: { children: ReactNode }) {
  const value = useTerminalState();
  return createElement(SharedTerminalContext.Provider, { value }, children);
}
export function useTerminalContext() {
  const context = useContext(SharedTerminalContext);
  if (!context) throw new Error('TerminalContextProvider is required');
  return context;
}
