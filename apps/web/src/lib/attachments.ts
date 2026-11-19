export type AttachmentStorageMode = 'array' | 'json-string' | 'single-string';

export function parseAttachmentRefs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? '').trim()).filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(v => String(v ?? '').trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [raw];
}

export function serializeAttachmentRefs(refs: string[], mode: AttachmentStorageMode = 'json-string'): string[] | string {
  const normalized = refs.map(v => String(v ?? '').trim()).filter(Boolean);
  if (mode === 'array') return normalized;
  if (mode === 'single-string') return normalized[normalized.length - 1] ?? '';
  return normalized.length ? JSON.stringify(normalized) : '';
}

export function isUnsafeAttachmentRef(ref: string) {
  const value = String(ref ?? '').trim().toLowerCase();
  return value.startsWith('/uploads/') || value.startsWith('uploads/') || value.startsWith('http://') || value.startsWith('https://');
}

export function isProtectedFileRef(ref: string) {
  return /^FILE-[A-Za-z0-9._:-]+$/.test(String(ref ?? '').trim());
}

/** Reserve the preview window during the click and show only an authorized supported blob. */
export async function previewProtectedAttachment(
  load: () => Promise<Blob | null>,
  messages: { blocked: string; unavailable: string },
): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error(messages.blocked);
  tab.opener = null;

  try {
    const blob = await load();
    if (!blob || tab.closed) {
      tab.close();
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
      throw new Error(messages.unavailable);
    }
    const url = URL.createObjectURL(blob);
    try {
      tab.location.href = url;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  } catch (error) {
    tab.close();
    throw error;
  }
}

/** Download only an already-authorized PDF blob; never accepts a remote/raw URL. */
export function downloadProtectedPdf(blob: Blob, filename: string): void {
  if (blob.type !== 'application/pdf' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/.test(filename)) {
    throw new Error('Unsupported PDF attachment');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
