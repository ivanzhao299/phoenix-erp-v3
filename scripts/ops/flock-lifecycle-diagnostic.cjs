/* Read-only diagnostics for an explicitly supplied, owned local/anonymized copy. Never loads .env. */
const {createRequire}=require('node:module');const {resolve}=require('node:path');
const apiRequire=createRequire(resolve('apps/api/package.json'));const {Client}=apiRequire('pg');
async function diagnose(db){
 const results=[];
 const run=async(name,sql)=>{
  try{await db.query('SAVEPOINT diagnostic_check');const r=await db.query(sql);await db.query('RELEASE SAVEPOINT diagnostic_check');results.push({check:name,state:r.rows.length?'REVIEW_REQUIRED':'NO_FINDINGS',rows:r.rows});}
  catch(e){await db.query('ROLLBACK TO SAVEPOINT diagnostic_check');results.push({check:name,state:'BLOCKED_SCHEMA',sqlstate:e.code});}
 };
 await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 await run('multiple_active_flocks',`SELECT house_code,array_agg(flock_no ORDER BY flock_no) AS flocks FROM brd_flocks WHERE status IS DISTINCT FROM 'RETIRED' OR COALESCE(current_qty,0)>0 GROUP BY house_code HAVING COUNT(*)>1`);
 await run('invalid_quantity_or_retirement',`SELECT flock_no,house_code,status,current_qty,initial_qty FROM brd_flocks WHERE current_qty IS NULL OR current_qty<0 OR current_qty<>trunc(current_qty) OR initial_qty IS NULL OR initial_qty<0 OR initial_qty<>trunc(initial_qty) OR status='RETIRED' AND COALESCE(current_qty,0)<>0`);
 await run('unverified_identity_dates_breed',`SELECT f.flock_no,f.house_code,f.farm_code,f.breed_code,f.start_date,f.placement_date,f.elimination_date,f.status FROM brd_flocks f WHERE
   f.status NOT IN ('ACTIVE','GROWING','LAYING','PEAK','DECLINING','RETIRED') OR f.status IS NULL OR COALESCE(f.start_date,f.placement_date) IS NULL
   OR f.placement_date IS NOT NULL AND f.start_date IS NOT NULL AND f.placement_date<>f.start_date OR f.elimination_date IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM sys_dict d WHERE d.dict_type='BRD_BREED' AND d.dict_code=f.breed_code AND d.status='ACTIVE')`);
 await run('ownership_or_capacity',`SELECT f.flock_no,f.house_code,f.farm_code,h.farm_code AS authoritative_farm,fa.company_code,h.max_capacity,f.current_qty FROM brd_flocks f LEFT JOIN brd_houses h ON h.house_code=f.house_code LEFT JOIN brd_farms fa ON fa.farm_code=h.farm_code WHERE h.house_code IS NULL OR fa.company_code IS NULL OR f.farm_code IS DISTINCT FROM h.farm_code OR NULLIF(to_jsonb(f)->>'company_code','') IS NOT NULL AND to_jsonb(f)->>'company_code' IS DISTINCT FROM fa.company_code OR h.max_capacity IS NULL OR h.max_capacity<=0 OR f.current_qty>h.max_capacity`);
 await run('legacy_daily_granularity',`SELECT house_code,log_date,array_agg(shift ORDER BY shift) AS shifts,array_agg(DISTINCT flock_no) AS flocks,COUNT(*) AS records FROM brd_daily_logs GROUP BY house_code,log_date HAVING COUNT(*)>1 OR COUNT(DISTINCT flock_no)>1 OR bool_or(shift IN ('ALL','DAILY')) AND COUNT(*)>1`);
 await run('discontinuous_snapshots',`SELECT flock_no,house_code,log_date,id,opening_qty,closing_qty,previous_closing FROM(SELECT *,lag(closing_qty) OVER(PARTITION BY flock_no ORDER BY log_date,id) AS previous_closing FROM brd_daily_logs)d WHERE opening_qty IS NULL OR closing_qty IS NULL OR closing_qty<>opening_qty-COALESCE(mortality_qty,0)-COALESCE(elimination_qty,0) OR previous_closing IS NOT NULL AND opening_qty<>previous_closing`);
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
