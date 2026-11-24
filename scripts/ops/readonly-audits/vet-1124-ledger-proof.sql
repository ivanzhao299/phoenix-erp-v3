-- Match the Node.js JSON serialization used by readProductionLedger().
-- Return only the 32-byte release receipt for this read-only snapshot.
WITH legacy AS (
  SELECT string_agg(
    '{"filename":' || coalesce(to_json(filename)::text, 'null') ||
    ',"applied_at":' || coalesce(trim_scale((((extract(epoch FROM applied_at) * 1000)::float8)::text)::numeric)::text, 'null') || '}',
    ',' ORDER BY filename) AS entries
  FROM schema_migrations
), orm AS (
  SELECT string_agg(
    '{"name":' || coalesce(to_json(name)::text, 'null') ||
    ',"timestamp":' || coalesce(to_json(timestamp)::text, 'null') || '}',
    ',' ORDER BY timestamp, name) AS entries
  FROM migrations
)
SELECT 'VET_LEDGER_PROOF' AS section,
  encode(sha256(convert_to('{"legacy":[' || coalesce(legacy.entries, '') ||
    '],"typeorm":[' || coalesce(orm.entries, '') || ']}', 'UTF8')), 'base64') AS receipt
FROM legacy CROSS JOIN orm;
