import { redactSensitive } from './redact-sensitive';

describe('redactSensitive', () => {
  it('keeps ordinary fields and redacts sensitive fields', () => {
    expect(redactSensitive({ name: 'Alice', password: 'secret', nested: { token: 'jwt' } })).toEqual({
      name: 'Alice', password: '[REDACTED]', nested: { token: '[REDACTED]' },
    });
  });

  it('redacts sensitive values inside arrays', () => {
    expect(redactSensitive({ attachments: [{ signedUrl: 'https://example.test/?sig=1' }], qty: 2 })).toEqual({
      attachments: '[REDACTED]', qty: 2,
    });
  });
});
