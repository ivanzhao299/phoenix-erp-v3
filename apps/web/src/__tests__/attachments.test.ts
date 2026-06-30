import { describe, it, expect } from 'vitest';
import {
  parseAttachmentRefs,
  serializeAttachmentRefs,
  isUnsafeAttachmentRef,
  isProtectedFileRef,
} from '@/lib/attachments';

/**
 * 附件引用解析/序列化 + 安全校验。
 * CLAUDE.md 约定 #4：凭证/合同走受保护 FILE- 引用，禁裸 URL / /uploads 路径。
 */

describe('parseAttachmentRefs', () => {
  it('returns trimmed non-empty entries from an array', () => {
    expect(parseAttachmentRefs(['  FILE-a ', '', 'FILE-b'])).toEqual(['FILE-a', 'FILE-b']);
  });

  it('parses a JSON-string array form', () => {
    expect(parseAttachmentRefs('["FILE-a","FILE-b"]')).toEqual(['FILE-a', 'FILE-b']);
  });

  it('treats a plain non-JSON string as a single ref', () => {
    expect(parseAttachmentRefs('FILE-single')).toEqual(['FILE-single']);
  });

  it('edge: empty / null / undefined yield empty array', () => {
    expect(parseAttachmentRefs('')).toEqual([]);
    expect(parseAttachmentRefs(null)).toEqual([]);
    expect(parseAttachmentRefs(undefined)).toEqual([]);
  });

  it('edge: malformed JSON array does not throw, returns empty', () => {
    expect(parseAttachmentRefs('["FILE-a", ')).toEqual([]);
  });
});

describe('serializeAttachmentRefs', () => {
  it('default json-string mode produces a JSON array string', () => {
    expect(serializeAttachmentRefs(['FILE-a', 'FILE-b'])).toBe('["FILE-a","FILE-b"]');
  });

  it('array mode returns a normalized string[]', () => {
    expect(serializeAttachmentRefs([' FILE-a ', ''], 'array')).toEqual(['FILE-a']);
  });

  it('single-string mode keeps only the last ref (CLAUDE.md #4)', () => {
    expect(serializeAttachmentRefs(['FILE-a', 'FILE-b'], 'single-string')).toBe('FILE-b');
  });

  it('edge: empty input -> empty string for json-string, empty string for single-string', () => {
    expect(serializeAttachmentRefs([])).toBe('');
    expect(serializeAttachmentRefs([], 'single-string')).toBe('');
  });
});

describe('isUnsafeAttachmentRef (fail-closed for raw URLs / upload paths)', () => {
  it('flags http(s) URLs as unsafe', () => {
    expect(isUnsafeAttachmentRef('http://evil/x')).toBe(true);
    expect(isUnsafeAttachmentRef('https://cdn/x.png')).toBe(true);
  });

  it('flags /uploads and uploads/ paths as unsafe', () => {
    expect(isUnsafeAttachmentRef('/uploads/x')).toBe(true);
    expect(isUnsafeAttachmentRef('uploads/x')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isUnsafeAttachmentRef('HTTPS://CDN/x')).toBe(true);
  });

  it('a protected FILE- ref is NOT unsafe', () => {
    expect(isUnsafeAttachmentRef('FILE-abc123')).toBe(false);
  });
});

describe('isProtectedFileRef', () => {
  it('accepts canonical FILE- tokens', () => {
    expect(isProtectedFileRef('FILE-abc_123.def-ghi:jkl')).toBe(true);
  });

  it('rejects a raw URL or arbitrary string', () => {
    expect(isProtectedFileRef('https://cdn/x')).toBe(false);
    expect(isProtectedFileRef('not-a-file-ref')).toBe(false);
    expect(isProtectedFileRef('')).toBe(false);
  });
});
