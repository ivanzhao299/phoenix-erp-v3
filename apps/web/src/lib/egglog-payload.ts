export interface EgglogEntryValues {
  eggs: number;
  dirty: number;
  broken: number;
  temp: string;
  humidity: string;
}

export function egglogSummarySnapshot(entry: EgglogEntryValues) {
  return {
    eggs_produced: Math.max(0, Number(entry.eggs) || 0),
    dirty_eggs: Math.max(0, Number(entry.dirty) || 0),
    broken_eggs: Math.max(0, Number(entry.broken) || 0),
    temp: entry.temp !== '' ? Number(entry.temp) : null,
    humidity: entry.humidity !== '' ? Number(entry.humidity) : null,
  };
}

export type EgglogSummarySnapshot = ReturnType<typeof egglogSummarySnapshot>;

export function buildEgglogPayload(
  entry: EgglogEntryValues,
  base: {
    house_code: string;
    flock_no?: string;
    log_date: string;
    shift: string;
    operator?: string;
    expectedSummary?: EgglogSummarySnapshot | null;
  },
) {
  const summary = egglogSummarySnapshot(entry);
  return {
    ...base,
    ...summary,
    // The mobile form records only the two known defect grades.
    eggs_by_grade: { DIRTY: summary.dirty_eggs, BROKEN: summary.broken_eggs },
  };
}
