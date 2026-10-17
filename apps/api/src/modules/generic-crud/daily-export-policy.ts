/** Internal-only query policy. HTTP query strings cannot manufacture a Symbol key. */
export const DAILY_EXPORT_SNAPSHOT = Symbol('daily-export-snapshot');
export const DAILY_EXPORT_MAX_ROWS = 20000;
