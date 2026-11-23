import 'reflect-metadata';
import { createInterface } from 'readline';
import { DataSource } from 'typeorm';
import { CUTOVER_OPERATOR_ENTITIES } from '../modules/wms/production-cutover-operator';
import { executeBoundCutover, HostPermit, recoverCutoverOutcome } from '../modules/wms/production-cutover-session';

// Fixed private stdio protocol. The host runs the immutable API image as the enrolled peer-auth UID.
// The independent issuer sees the idle backend (both session locks held) before delivering its admission.
async function worker() {
  if(process.argv.length!==3||process.argv[2]!=='--host-stdio'||process.getuid?.()===0)throw Error('HOST_REQUIRED');
  const frames=createInterface({input:process.stdin,terminal:false})[Symbol.asyncIterator]();
  const read=async()=>{
    const {done,value}=await frames.next();
    if(done||value.length>16384)throw Error('PRIVATE_HOST_CHANNEL_REQUIRED');
    return JSON.parse(value);
  };
  const send=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
  const {operation,database,role,permit}=await read() as {operation:string;database:string;role:string;permit:HostPermit};
  if(!['execute','recover'].includes(operation)||![database,role].every(v=>typeof v==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(v)))throw Error('IDENTITY_REQUIRED');
  const db=await new DataSource({type:'postgres',host:'/run/phoenix-cutover-postgres',port:5432,database,username:role,
    entities:CUTOVER_OPERATOR_ENTITIES,synchronize:false,migrationsRun:false,installExtensions:false,
    extra:{max:1,connectionTimeoutMillis:5000,options:'-c search_path=public -c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=45000'}}).initialize();
  const q=db.createQueryRunner();
  try{
    await q.connect();
    if(operation==='execute'){
      for(const key of [1,2])if(!(await q.query('SELECT pg_try_advisory_lock(17455,$1) AS ok',[key]))[0].ok)throw Error('FENCE_BUSY');
    }
    const [backend]=await q.query(`SELECT pid,datid::text AS database_oid,
        trunc(extract(epoch FROM backend_start)*1000000)::text AS start_micros,
        trunc(extract(epoch FROM pg_postmaster_start_time())*1000000)::text AS server_micros
      FROM pg_stat_activity WHERE pid=pg_backend_pid() AND usename=session_user AND NOT pg_is_in_recovery()`);
    if(!backend)throw Error('PRIMARY_REQUIRED');
    send({step:'BACKEND',backend});
    if((await read()).step!=='CONTINUE')throw Error('HOST_HOLD');
    if(operation==='execute'){
      // This is an idle, unconsumed original permit. Only the separately registered issuer can create it.
      const deadline=Date.now()+90000;
      while(!(await q.query('SELECT 1 FROM production_cutover_apply_admissions WHERE id=$1',[permit.admissionId])).length){
        if(Date.now()>=deadline)throw Error('ISSUER_TIMEOUT');
        await new Promise(resolve=>setTimeout(resolve,750));
      }
    }
    const fence=async()=>{
      send({step:'RECHECK'});
      if((await read()).step!=='VERIFIED')throw Error('HOST_HOLD');
    };
    const outcome=operation==='recover'?await recoverCutoverOutcome(q,permit):await executeBoundCutover(q,permit,fence);
    send({step:'OUTCOME',outcome});
  }finally{
    // This process owns the pool. Do not return an indeterminate session to anyone else.
    await q.release();await db.destroy();
  }
}
if(require.main===module){
  // Bound host loss even while the process is awaiting an issuer or private frame.
  const deadline=setTimeout(()=>process.exit(2),180000);
  worker().catch(()=>{process.stderr.write('PRODUCTION_CUTOVER=HOLD_WORKER\n');process.exitCode=2;})
    .finally(()=>{clearTimeout(deadline);process.stdin.destroy();});
}
