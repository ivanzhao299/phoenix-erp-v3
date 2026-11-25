'use client';

import { useEffect, useRef, useState } from 'react';
import request from '@/lib/api-client';

interface MedicineInboundLine {
  company_code: string;
  site_code: string;
  warehouse_code: string;
  material_code: string;
  qty: number;
  note?: string;
  manufacturer_batch_no?: string;
  expire_date?: string;
}

interface MedicineInboundDraft {
  date: string;
  items: MedicineInboundLine[];
  actionKey: string;
}

interface MedicineInboundReceipt {
  lines: { batchNo: string; ledgerId: number }[];
}

export function useMedicineInbound(actor: string, path: string) {
  const storageKey = actor ? 'farm:medicine:inbound:' + actor : '';
  const [stored, setStored] = useState<{ storageKey: string; draft: MedicineInboundDraft }>();
  const pending = stored?.storageKey === storageKey ? stored?.draft : undefined;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const draft = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as MedicineInboundDraft | null;
        if (draft?.actionKey && Array.isArray(draft.items)) setStored({ storageKey, draft });
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    });
    return () => { active = false; };
  }, [storageKey]);

  async function submit(date: string, items: MedicineInboundLine[]) {
    if (!storageKey || inFlight.current) return;
    inFlight.current = true;
    const draft = pending ?? { date, items, actionKey: crypto.randomUUID() };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
      setStored({ storageKey, draft });
      const response = await request<{ code: number; data?: MedicineInboundReceipt }>(
        path.replace(/^\/api\//, '/'), { method: 'POST', body: JSON.stringify(draft), bindSession: true });
      if (response.code !== 200 || !Array.isArray(response.data?.lines) || !response.data.lines.length
          || !response.data.lines.every(line => line.batchNo && Number.isSafeInteger(line.ledgerId) && line.ledgerId > 0)) {
        throw new Error('药品入库回执待核，请使用原请求找回');
      }
      sessionStorage.removeItem(storageKey);
      setStored(undefined);
      return response.data;
    } catch (error) {
      if ((error as { status?: number })?.status === 400) {
        sessionStorage.removeItem(storageKey);
        setStored(undefined);
      }
      throw error;
    } finally {
      inFlight.current = false;
    }
  }

  return { pending, submit };
}
