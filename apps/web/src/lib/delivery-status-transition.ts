export const DELIVERY_ACTION_STATUS: Readonly<Record<string, string>> = {
  'start-loading': 'LOADING',
  'finish-loading': 'LOADED',
  depart: 'DEPARTED',
  arrive: 'ARRIVED',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};

export function resolveDeliveryStatus(
  endpoint: string,
  response: unknown,
): string | undefined {
  if (response && typeof response === 'object') {
    const record = response as {
      status?: unknown;
      data?: unknown;
      order?: unknown;
    };
    const nested = record.data ?? record.order;
    if (nested && typeof nested === 'object') {
      const nestedStatus = (nested as { status?: unknown }).status;
      if (typeof nestedStatus === 'string' && nestedStatus.length > 0) {
        return nestedStatus;
      }
    }
    const status = record.status;
    if (typeof status === 'string' && status.length > 0) return status;
  }

  return DELIVERY_ACTION_STATUS[endpoint];
}

export function unwrapDeliveryActionOrder<T extends object>(
  response: unknown,
): Partial<T> {
  if (!response || typeof response !== 'object') return {};
  const record = response as Record<string, unknown>;
  const nested = record.data ?? record.order;
  return nested && typeof nested === 'object'
    ? nested as Partial<T>
    : record as Partial<T>;
}
