export const TRANSFER_LIFECYCLE_STATUSES = [
  "PENDING",
  "IN_TRANSIT",
  "RECEIVED",
  "COMPLETED",
] as const;

// CANCELLED is retained as a read-only compatibility value for historical rows.
// It is not part of the current backend transition graph or database CHECK.
export const TRANSFER_DISPLAY_STATUSES = [
  ...TRANSFER_LIFECYCLE_STATUSES,
  "CANCELLED",
] as const;

export type TransferAction = "dispatch" | "receive";

export function transferActionForStatus(status: unknown): TransferAction | null {
  if (status === "PENDING") return "dispatch";
  if (status === "IN_TRANSIT") return "receive";
  return null;
}

export function transferStatusKey(status: unknown): string | null {
  const value = String(status ?? "");
  return (TRANSFER_DISPLAY_STATUSES as readonly string[]).includes(value)
    ? `warehouse.transfer.status.${value.toLowerCase()}`
    : null;
}

export function transferStatusLabel(
  status: unknown,
  translate: (key: string, fallback?: string) => string,
): string {
  const value = String(status ?? "");
  if (!value) return "—";
  const key = transferStatusKey(value);
  return key ? translate(key, value) : value;
}
