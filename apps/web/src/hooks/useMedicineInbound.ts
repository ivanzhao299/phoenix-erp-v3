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

function readDraft(key: string): MedicineInboundDraft | null {
  const draft = JSON.parse(sessionStorage.getItem(key) ?? 'null') as MedicineInboundDraft | null;
  return draft?.actionKey && Array.isArray(draft.items) ? draft : null;
}

export function useMedicineInbound(actor: string, path: string) {
  const storageKey = actor ? 'farm:medicine:inbound:' + actor : '';
  const [stored, setStored] = useState<{ storageKey: string; draft: MedicineInboundDraft | null }>();
  const ready = Boolean(storageKey) && stored?.storageKey === storageKey;
  const pending = ready ? stored?.draft : undefined;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let draft: MedicineInboundDraft | null = null;
      try {
        draft = readDraft(storageKey);
      } catch {
        // A new submission must still persist its request before sending it.
      }
      setStored({ storageKey, draft });
    });
    return () => { active = false; };
  }, [storageKey]);

  function clearDraft(draft: MedicineInboundDraft) {
    if (readDraft(storageKey)?.actionKey !== draft.actionKey) return;
    sessionStorage.removeItem(storageKey);
    setStored({ storageKey, draft: null });
  }

  async function send(draft: MedicineInboundDraft) {
    inFlight.current = true;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
      setStored({ storageKey, draft });
      const response = await request<{ code: number; data?: MedicineInboundReceipt }>(
        path.replace(/^\/api\//, '/'), { method: 'POST', body: JSON.stringify(draft), bindSession: true });
      if (response.code !== 200 || !Array.isArray(response.data?.lines) || !response.data.lines.length
          || !response.data.lines.every(line => line.batchNo && Number.isSafeInteger(line.ledgerId) && line.ledgerId > 0)) {
        throw new Error('药品入库回执待核，请使用原请求找回');
      }
      clearDraft(draft);
      return response.data;
    } catch (error) {
      if ((error as { status?: number })?.status === 400) clearDraft(draft);
      throw error;
    } finally {
      inFlight.current = false;
    }
  }

  async function submit(date: string, items: MedicineInboundLine[]) {
    if (!ready || inFlight.current || !items.length) return;
    const existing = readDraft(storageKey);
    if (existing) {
      setStored({ storageKey, draft: existing });
      return;
    }
    return send({ date, items, actionKey: crypto.randomUUID() });
  }

  async function recover() {
    if (!ready || inFlight.current) return;
    const draft = readDraft(storageKey);
    if (!draft) {
      setStored({ storageKey, draft: null });
      return;
    }
    return send(draft);
  }

  return { ready, pending, submit, recover };
}
