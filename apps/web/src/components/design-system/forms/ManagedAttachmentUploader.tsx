'use client';

import { AttachmentUploader } from './AttachmentUploader';
import { type AttachmentStorageMode, parseAttachmentRefs, serializeAttachmentRefs } from '@/lib/attachments';

export interface ManagedAttachmentUploaderProps {
  value: unknown;
  onChange: (value: string[] | string) => void;
  readOnly?: boolean;
  label?: string;
  apiBase?: string;
  storage?: AttachmentStorageMode;
}

export function ManagedAttachmentUploader({
  value,
  onChange,
  readOnly,
  label,
  apiBase,
  storage = 'json-string',
}: ManagedAttachmentUploaderProps) {
  const refs = parseAttachmentRefs(value);
  return (
    <AttachmentUploader
      value={refs}
      onChange={urls => onChange(serializeAttachmentRefs(urls, storage))}
      readOnly={readOnly}
      label={label}
      apiBase={apiBase}
    />
  );
}
