/** Keep monetary evidence exact through PostgreSQL JSON -> JavaScript -> frozen JSON. */
const decimals=['unit_cost','cost_change','recorded_unit_cost','recorded_amount','known_amount'] as const;
export function cutoverFactSql(columns:Set<string>|undefined,alias='f'):string{
  if(!/^[a-z]+$/.test(alias))throw new Error('Internal evidence alias required');
  const fields=decimals.filter(field=>columns?.has(field));
  return `to_jsonb(${alias})`+(fields.length?`||jsonb_build_object(${fields.map(field=>`'${field}',${alias}.${field}::text`).join(',')})`:'');
}
