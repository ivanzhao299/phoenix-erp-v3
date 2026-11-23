/** Both columns describe the same facility limit. A mismatch must never raise the limit. */
export function resolveHouseCapacity(house: { capacity?: number | null; max_capacity?: number | null }): number | null {
  const limits = [house.capacity, house.max_capacity].filter(
    (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
  );
  return limits.length ? Math.min(...limits) : null;
}
