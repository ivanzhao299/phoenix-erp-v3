// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  parseAttachmentRefs,
  serializeAttachmentRefs,
  isUnsafeAttachmentRef,
  isProtectedFileRef,
  downloadProtectedPdf,
  previewProtectedAttachment,
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

describe('previewProtectedAttachment', () => {
  const messages = { blocked: 'Preview blocked', unavailable: 'Evidence unavailable' };

  it('reserves an isolated window before fetching and revokes the typed blob URL', async () => {
    vi.useFakeTimers();
    const tab = { opener: window, closed: false, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const create = vi.fn(() => 'blob:owned-preview');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    try {
      const proof = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      await previewProtectedAttachment(async () => {
        expect(open).toHaveBeenCalledWith('about:blank', '_blank');
        expect(tab.opener).toBeNull();
        return proof;
      }, messages);
      expect(create).toHaveBeenCalledWith(proof);
      expect(tab.location.href).toBe('blob:owned-preview');
      vi.advanceTimersByTime(60_000);
      expect(revoke).toHaveBeenCalledWith('blob:owned-preview');
    } finally {
      open.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('closes an unused preview without navigating on a stale or unsupported response', async () => {
    const tab = { opener: window, closed: false, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    try {
      await previewProtectedAttachment(async () => null, messages);
      await expect(previewProtectedAttachment(async () => new Blob(['test'], { type: 'text/html' }), messages))
        .rejects.toThrow(messages.unavailable);
      expect(tab.close).toHaveBeenCalledTimes(2);
      expect(tab.location.href).toBe('');
    } finally {
      open.mockRestore();
    }
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


describe('downloadProtectedPdf', () => {
  it('downloads the authorized bytes using a safe name and revokes its blob URL', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:owned-pdf'), revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:owned-pdf');
      expect(this.download).toBe('flock-evidence-1.pdf');
    });
    try {
      const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      downloadProtectedPdf(blob, 'flock-evidence-1.pdf');
      expect(create).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a')).toBeNull();
      vi.advanceTimersByTime(60_000);
      expect(revoke).toHaveBeenCalledWith('blob:owned-pdf');
      for (const [bytes,name] of [[new Blob(['<script/>'],{type:'text/html'}),'evidence.pdf'],[blob,'../unsafe.pdf'],[blob,'https://evil/file.pdf']] as const) {
        expect(() => downloadProtectedPdf(bytes,name)).toThrow('Unsupported PDF attachment');
      }
      expect(create).toHaveBeenCalledTimes(1);
    } finally { click.mockRestore();vi.unstubAllGlobals();vi.useRealTimers(); }
  });
});
