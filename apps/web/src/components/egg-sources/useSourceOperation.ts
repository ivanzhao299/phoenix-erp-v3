'use client';

import { useRef, useState } from 'react';
import { usePermission } from '@/hooks/usePermission';
import request, { type ApiError } from '@/lib/api-client';

const readOptions = { silent: true, bindSession: true, cache: 'no-store' } as const;
type Command = { requestId: string };
type Operation<T> = { account: string; id: string; path?: string; method?: 'PUT' | 'POST'; body?: T };

export function useSourceOperation<T extends Command, R>(name: string, kind: string | string[]) {
  const { user } = usePermission();
  const account = String(user.userId ?? user.user_id ?? user.id ?? user.username ?? '');
  const operationKind=name==='retire'?'retire':'rollout';
  const storageKey = account ? 'egg-source-operation:' + account + ':' + name : null;
  const [active, setActive] = useState<Operation<T>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const inFlight=useRef(false);
  const pending = active?.account === account ? active : undefined;

  function remember(operation?: Operation<T>) {
    setActive(operation);
    if (storageKey) {
      try {
        if (operation) sessionStorage.setItem(storageKey, operation.id);
        else sessionStorage.removeItem(storageKey);
      } catch { /* The in-memory operation remains available. */ }
    }
  }

  function restore() {
    if (pending || !storageKey) return pending;
    try {
      const id = sessionStorage.getItem(storageKey);
      if (id) {
        const operation = { account, id };
        setActive(operation);
        return operation;
      }
    } catch { /* Optional browser storage. */ }
    return undefined;
  }

  async function lookup(operation = pending) {
    if (!operation || inFlight.current) return;
    inFlight.current=true;
    setBusy(true);
    setError(undefined);
    try {
      const { data } = await request<{ data: { kind: string; receipt: R } }>(
        '/sys/menu-registry/egg-source-operation-receipts/' + encodeURIComponent(operation.id), readOptions,
      );
      const cancelled=data.kind==='OPERATION_CANCELLED'&&
        (data.receipt as {operation?:string}).operation===operationKind;
      if (!cancelled&&(typeof kind==='string'?kind!==data.kind:!kind.includes(data.kind))) return;
      remember();
      return data.receipt;
    } catch (failure) {
      setError(failure as ApiError);
    } finally {
      inFlight.current=false;
      setBusy(false);
    }
  }

  async function send(operation: Operation<T>, retry = false) {
    if (!operation.body || !operation.path || !operation.method || inFlight.current) return;
    inFlight.current=true;
    setBusy(true);
    setError(undefined);
    remember(operation);
    try {
      const { data } = await request<{ data: R }>(operation.path, {
        ...readOptions, method: operation.method, retry: false,
        body: JSON.stringify(operation.body),
      });
      remember();
      return data;
    } catch (failure) {
      const detail = failure as ApiError;
      setError(detail);
      const status=detail.status;
      if (!retry && status!==undefined && status>=400 && status<500 && ![408,429].includes(status)) remember();
    } finally {
      inFlight.current=false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (!pending||inFlight.current) return;
    inFlight.current=true;
    setBusy(true);setError(undefined);
    try {
      const {data}=await request<{data:R}>('/sys/menu-registry/egg-source-operation-receipts/'+encodeURIComponent(pending.id)+'/cancel',{
        ...readOptions,method:'POST',retry:false,body:JSON.stringify({operation:operationKind}),
      });
      remember();
      return data;
    } catch (failure) {
      setError(failure as ApiError);
    } finally {
      inFlight.current=false;
      setBusy(false);
    }
  }

  return {
    pending, busy, error, restore, lookup,cancel,
    clearError: () => setError(undefined),
    start: (path: string, method: 'PUT' | 'POST', body: T) => send({ account, id: body.requestId, path, method, body }),
    retry: () => pending ? send(pending, true) : undefined,
  };
}
