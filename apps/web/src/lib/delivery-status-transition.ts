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
    const status = (response as { status?: unknown }).status;
    if (typeof status === 'string' && status.length > 0) return status;
  }

  return DELIVERY_ACTION_STATUS[endpoint];
}
