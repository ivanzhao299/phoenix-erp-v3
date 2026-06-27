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
