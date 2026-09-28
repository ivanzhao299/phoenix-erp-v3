const SENSITIVE_KEY = /password|token|authorization|secret|apikey|api_key|credential|private[_-]?key|signed[_-]?url|attachment(?:[_-]?url)?/i;

/** Return a log-safe copy while preserving ordinary request fields. */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(child),
    ]),
  );
}
