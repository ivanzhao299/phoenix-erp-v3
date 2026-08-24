export interface EgglogEntryValues {
  eggs: number;
  dirty: number;
  broken: number;
  temp: string;
  humidity: string;
}

export function buildEgglogPayload(
  entry: EgglogEntryValues,
  base: {
    house_code: string;
    flock_no?: string;
    log_date: string;
    shift: string;
    operator?: string;
  },
) {
  const dirty = Math.max(0, Number(entry.dirty) || 0);
  const broken = Math.max(0, Number(entry.broken) || 0);

  return {
    ...base,
    // Mobile only knows the total saleable count, not its GRADE_1..5 split.
    // Keep that total explicit and publish only the two genuinely known grades.
    eggs_produced: Math.max(0, Number(entry.eggs) || 0),
    dirty_eggs: dirty,
    broken_eggs: broken,
    eggs_by_grade: {
      DIRTY: dirty,
      BROKEN: broken,
    },
    temp: entry.temp !== '' ? Number(entry.temp) : null,
    humidity: entry.humidity !== '' ? Number(entry.humidity) : null,
  };
}
