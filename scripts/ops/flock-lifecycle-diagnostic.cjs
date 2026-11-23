/* Read-only diagnostics for an explicitly supplied, owned local/anonymized copy. Never loads .env. */
const {createRequire}=require('node:module');const {resolve}=require('node:path');
const apiRequire=createRequire(resolve('apps/api/package.json'));const {Client}=apiRequire('pg');
async function diagnose(db){
 const results=[];
 const run=async(name,sql)=>{
  try{await db.query('SAVEPOINT diagnostic_check');const r=await db.query(sql);await db.query('RELEASE SAVEPOINT diagnostic_check');results.push({check:name,state:r.rows.length?'REVIEW_REQUIRED':'NO_FINDINGS',rows:r.rows});}
  catch(e){await db.query('ROLLBACK TO SAVEPOINT diagnostic_check');results.push({check:name,state:'BLOCKED_SCHEMA',sqlstate:e.code});}
 };
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 await run('multiple_active_flocks',`SELECT house_code,array_agg(flock_no ORDER BY flock_no) AS flocks FROM brd_flocks WHERE status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0 GROUP BY house_code HAVING COUNT(*)>1`);
 await run('invalid_quantity_or_retirement',`SELECT flock_no,house_code,status,current_qty,initial_qty FROM brd_flocks WHERE current_qty IS NULL OR current_qty<0 OR current_qty<>trunc(current_qty) OR initial_qty IS NULL OR initial_qty<0 OR initial_qty<>trunc(initial_qty) OR status='RETIRED' AND COALESCE(current_qty,0)<>0`);
 await run('unverified_identity_dates_breed',`SELECT f.flock_no,f.house_code,f.farm_code,f.breed_code,f.start_date,f.placement_date,f.elimination_date,f.status FROM brd_flocks f WHERE
   f.status NOT IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING','RETIRED') OR f.status IS NULL OR COALESCE(f.start_date,f.placement_date) IS NULL
   OR f.placement_date IS NOT NULL AND f.start_date IS NOT NULL AND f.placement_date<>f.start_date OR f.elimination_date IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM sys_dict d WHERE d.dict_type='BRD_BREED' AND d.dict_code=f.breed_code AND d.status='ACTIVE')`);
 await run('ownership_or_capacity',`SELECT f.flock_no,f.house_code,f.farm_code,h.farm_code AS authoritative_farm,fa.company_code,
   limits.capacity,limits.max_capacity,effective.capacity AS effective_capacity,f.current_qty
   FROM brd_flocks f LEFT JOIN brd_houses h ON h.house_code=f.house_code LEFT JOIN brd_farms fa ON fa.farm_code=h.farm_code
   CROSS JOIN LATERAL (SELECT (to_jsonb(h)->>'capacity')::integer AS capacity,(to_jsonb(h)->>'max_capacity')::integer AS max_capacity) limits
   CROSS JOIN LATERAL (SELECT LEAST(CASE WHEN limits.capacity>0 THEN limits.capacity END,CASE WHEN limits.max_capacity>0 THEN limits.max_capacity END) AS capacity) effective
   WHERE h.house_code IS NULL OR fa.company_code IS NULL OR f.farm_code IS DISTINCT FROM h.farm_code
     OR NULLIF(to_jsonb(f)->>'company_code','') IS NOT NULL AND to_jsonb(f)->>'company_code' IS DISTINCT FROM fa.company_code
     OR effective.capacity IS NULL OR f.current_qty>effective.capacity
     OR limits.capacity>0 AND limits.max_capacity>0 AND limits.capacity<>limits.max_capacity`);
 const {rows:[schema]}=await db.query("SELECT to_regclass('production_cutover_scopes') AS cutovers");
 const officialDay=schema.cutovers ? `EXISTS (
   SELECT 1 FROM production_cutover_scopes s WHERE s.company_code=to_jsonb(d)->>'company_code'
     AND s.house_code=d.house_code AND s.state IN ('ACTIVE','SUSPENDED') AND d.log_date>=s.first_production_date
 )` : 'false';
 await run('legacy_daily_granularity',`
   SELECT house_code,log_date,array_agg(shift ORDER BY shift) AS shifts,
          array_agg(DISTINCT flock_no) AS flocks,COUNT(*) AS records
   FROM brd_daily_logs d GROUP BY house_code,log_date
   HAVING COUNT(DISTINCT flock_no)>1 OR COUNT(*)>1 AND (
     NOT bool_and(${officialDay}) OR bool_or(shift IS NULL OR shift NOT IN ('AM','PM')) OR COUNT(DISTINCT shift)<>COUNT(*)
   )`);
 // Confirmed occupancy reports derive opening, closing and losses from events. Their shift rows cannot be
 // reconciled using the legacy daily equation; the event balance check below covers the managed ledger.
 await run('discontinuous_snapshots',`
   SELECT flock_no,house_code,log_date,id,opening_qty,closing_qty,previous_closing
   FROM (
     SELECT d.*,lag(closing_qty) OVER(PARTITION BY flock_no ORDER BY log_date,id) AS previous_closing
     FROM brd_daily_logs d WHERE to_jsonb(d)->>'occupancy_id' IS NULL
   ) legacy
   WHERE opening_qty IS NULL OR closing_qty IS NULL
     OR closing_qty<>opening_qty-COALESCE(mortality_qty,0)-COALESCE(elimination_qty,0)
     OR previous_closing IS NOT NULL AND opening_qty<>previous_closing`);
 await run('occupancy_event_balances', `
   WITH facts AS (
     SELECT occupancy_id, SUM(quantity_delta) AS birds
     FROM brd_flock_events WHERE occupancy_id IS NOT NULL GROUP BY occupancy_id
   )
   SELECT o.company_code, o.house_code, o.flock_no, o.id AS occupancy_id, o.began_on, o.ended_on,
          COALESCE(f.birds, 0) AS event_birds,
          CASE WHEN o.ended_on IS NULL THEN b.quantity ELSE 0 END AS expected_birds
   FROM brd_flock_occupancies o
   LEFT JOIN facts f ON f.occupancy_id=o.id
   LEFT JOIN brd_flock_balances b ON b.flock_no=o.flock_no
   WHERE f.birds IS NULL OR b.flock_no IS NULL
      OR (o.ended_on IS NULL AND (b.house_code IS DISTINCT FROM o.house_code OR b.closed_on IS NOT NULL))
      OR f.birds IS DISTINCT FROM CASE WHEN o.ended_on IS NULL THEN b.quantity ELSE 0 END
   ORDER BY o.company_code,o.house_code,o.began_on,o.id`);
 await run('house_business_date_sequence', `
   WITH changes AS (
     SELECT company_code, house_code, document_id, kind, business_date,
            LAG(document_id) OVER house_events AS prior_document,
            LAG(kind) OVER house_events AS prior_kind,
            LAG(business_date) OVER house_events AS prior_day
     FROM brd_flock_events
     WHERE kind IN ('BASELINE','ADMIT','TRANSFER_IN','TRANSFER_OUT','CLOSE','CLEAN_START','CLEAN_ACCEPT')
     WINDOW house_events AS (PARTITION BY company_code,house_code ORDER BY recorded_at,id)
   )
   SELECT * FROM changes
   WHERE business_date < prior_day
      OR (kind IN ('TRANSFER_IN','ADMIT') AND prior_kind IS DISTINCT FROM 'CLEAN_ACCEPT')
      OR (kind='CLEAN_ACCEPT' AND prior_kind IS DISTINCT FROM 'CLEAN_START')
   ORDER BY company_code,house_code,business_date,document_id`);
 await run('formal_report_grade_values', `
   SELECT d.company_code,d.house_code,d.log_date,d.shift,d.id
   FROM brd_daily_logs d
   WHERE EXISTS (
     SELECT 1 FROM production_cutover_scopes s WHERE s.company_code=d.company_code
       AND s.house_code=d.house_code AND s.state IN ('ACTIVE','SUSPENDED') AND d.log_date>=s.first_production_date
   ) AND (
     jsonb_typeof(d.eggs_by_grade) IS DISTINCT FROM 'object' OR d.eggs_by_grade='{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(d.eggs_by_grade)='object' THEN d.eggs_by_grade ELSE '{}'::jsonb END) g
       WHERE CASE WHEN jsonb_typeof(g.value)='number' THEN
         (g.value::text)::numeric NOT BETWEEN 0 AND 9007199254740991
         OR trunc((g.value::text)::numeric)<>(g.value::text)::numeric
       ELSE true END
     )
   )
   ORDER BY d.company_code,d.house_code,d.log_date,d.id`);
 await run('commercial_source_overlap',`SELECT a.company_code,a.house_code,a.profile_code AS profile_a,b.profile_code AS profile_b FROM md_egg_source_profiles a JOIN md_egg_source_profiles b ON a.company_code=b.company_code AND a.house_code=b.house_code AND a.profile_code<b.profile_code WHERE a.status='ACTIVE' AND b.status='ACTIVE' AND daterange(a.effective_date,a.expire_date,'[]') && daterange(b.effective_date,b.expire_date,'[]')`);
 await run('active_houses_without_source',`SELECT h.house_code,f.company_code FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code WHERE h.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM md_egg_source_profiles p WHERE p.house_code=h.house_code AND p.company_code=f.company_code AND p.status='ACTIVE' AND p.effective_date<=CURRENT_DATE AND (p.expire_date IS NULL OR p.expire_date>=CURRENT_DATE))`);
 await run('legacy_inventory_postings',`SELECT company_code,log_date,change_type,ref_no,SUM(qty_change) AS quantity FROM inv_ledger WHERE change_type IN ('FARM_IN','FARM_REVERSED') GROUP BY company_code,log_date,change_type,ref_no ORDER BY company_code,log_date,ref_no`);
 await run('pending_ledger_receipts',`SELECT company_code,biz_type,biz_no,status FROM sys_notifications WHERE biz_type='FARM_LEDGER_PENDING'`);
 await run('unlinked_production_stock',`SELECT b.company_code,b.batch_no,b.source_type,b.egg_date,b.collection_batch_ref,b.qty FROM inv_batches b WHERE b.source_type IN ('TEMP_PRODUCTION','PACKAGING','PRODUCTION') AND NOT EXISTS(SELECT 1 FROM inv_flock_source_links l WHERE l.batch_no=b.batch_no)`);
 await run('production_received_totals',`SELECT r.company_code,r.house_code,r.production_date,r.entry_mode,SUM(r.quantity) AS received_qty FROM brd_egg_source_receipts r GROUP BY r.company_code,r.house_code,r.production_date,r.entry_mode`);
 await db.query('ROLLBACK');return {generatedAt:new Date().toISOString(),readOnly:true,automaticCorrections:0,activationApproved:false,checks:results};
}
module.exports={diagnose};
if(require.main===module)(async()=>{
 const url=process.env.FLOCK_DIAGNOSTIC_PG_URL;if(!url)throw Error('Provide FLOCK_DIAGNOSTIC_PG_URL for an owned local/anonymized copy; project .env is never read');
 const u=new URL(url);if(u.hostname!=='127.0.0.1'||!/^\/phoenix_flock_(review|lifecycle|compat)$/.test(u.pathname))throw Error('Only explicitly owned loopback flock fixture databases are accepted');
 const db=new Client({connectionString:url});await db.connect();try{console.log(JSON.stringify(await diagnose(db),null,2));}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
