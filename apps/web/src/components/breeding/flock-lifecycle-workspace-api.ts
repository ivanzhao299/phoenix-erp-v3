'use client';

import { useCallback, useEffect, useState } from 'react';
import request, { type ApiError } from '@/lib/api-client';
import { dispatchAuthExpired } from '@/lib/auth-dispatch';
import { lifecycleApi, type LifecycleAction, type LifecycleDocument, type LifecycleEnvelope } from './flock-lifecycle-workspace';

export function useLifecycleRead<T>(path: string | null) {
  const [state, setState] = useState<{ path: string; revision: number; data?: T; error?: ApiError }>();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<LifecycleEnvelope<T>>(`${lifecycleApi}${path}`, { signal: controller.signal, silent: true })
      .then(result => {
        if (!controller.signal.aborted) setState({ path, revision, data: result.data });
      })
      .catch((error: ApiError) => {
        if (!controller.signal.aborted) setState(previous => ({
          path,
          revision,
          data: previous?.path === path && ![401, 403, 404].includes(error.status ?? 0) ? previous.data : undefined,
          error,
        }));
      });
    return () => controller.abort();
  }, [path, revision]);

  const current = path && state?.path === path ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(path && !current), refreshing: Boolean(current && current.revision !== revision), reload };
}

export function detailPath(id: string) {
  return `/documents/${encodeURIComponent(id)}`;
}

export async function readLifecycleDocument(id: string, signal?: AbortSignal) {
  const result = await request<LifecycleEnvelope<LifecycleDocument>>(`${lifecycleApi}${detailPath(id)}`, { silent: true, signal });
  return result.data;
}

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('phoenix_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sendLifecycleAction(id: string, action: LifecycleAction, version: number) {
  const response = await fetch(`/api${lifecycleApi}${detailPath(id)}/${action}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== 200 || !result.data?.id) {
    if (response.status === 401) dispatchAuthExpired(result.subcode === 'PERMS_CHANGED' ? 'perms_changed' : 'expired');
    const message = Array.isArray(result.message) ? result.message.join(' · ') : result.message;
    throw Object.assign(new Error(message || ''), { status: response.status });
  }
  return (result as LifecycleEnvelope<LifecycleDocument>).data;
}

export async function readLifecycleEvidence(id: string, fileId: string, signal: AbortSignal) {
  const response = await fetch(`/api${lifecycleApi}${detailPath(id)}/evidence/${encodeURIComponent(fileId)}`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error();
  const blob = await response.blob();
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(blob.type)) throw new Error();
  return blob;
}
