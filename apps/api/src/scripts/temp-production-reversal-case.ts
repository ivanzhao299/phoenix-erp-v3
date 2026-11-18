import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { inspectTempProductionReversal } from '../modules/wms/temp-production-reversal-case';

/** Compiled image entry point. Never imports AppModule, dotenv or any Nest bootstrap. */
async function main(): Promise<void> {
  const args=process.argv.slice(2);
  if (args.length===1 && (args[0]==='--help' || args[0]==='--self-check')) {
    process.stdout.write('TEMP_PRODUCTION_REVERSAL_CLI=READY\nModes: preflight --release-sha <40-hex>\nProduction apply: RETIRED; historical test records are retained without the fixed 60-egg correction\n');
    return;
  }
  if (args[0]==='apply') {
    process.stderr.write(`${JSON.stringify({status:'HOLD',reason:'HISTORICAL_TEST_CORRECTION_RETIRED',
      disposition:'HISTORICAL_TEST_RECORDS_ONLY',databaseInitialized:false})}\n`);
    process.exitCode=2;return;
  }
  if (args.length!==3 || args[0]!=='preflight' || args[1]!=='--release-sha' || !/^[a-f0-9]{40}$/.test(args[2])) throw new Error('Invalid arguments; use --help');
  const {DB_HOST,DB_PORT,DB_USERNAME,DB_PASSWORD,DB_NAME}=process.env;
  if (!DB_HOST || !DB_USERNAME || !DB_NAME || !/^\d+$/.test(DB_PORT||'') || Number(DB_PORT)<1 || Number(DB_PORT)>65535) throw new Error('Explicit database environment required');
  const ds=new DataSource({type:'postgres',host:DB_HOST,port:Number(DB_PORT),username:DB_USERNAME,password:DB_PASSWORD,
    database:DB_NAME,entities:[],synchronize:false,migrationsRun:false,installExtensions:false,
    extra:{options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000'}});
  try {
    await ds.initialize();
    const plan=await ds.manager.transaction('REPEATABLE READ',async manager=>{
      await manager.query('SET TRANSACTION READ ONLY');
      return inspectTempProductionReversal(manager,args[2]);
    });
    process.stdout.write(`${JSON.stringify({...plan,applyStatus:'RETIRED',disposition:'HISTORICAL_TEST_RECORDS_ONLY'},null,2)}\n`);
    process.exitCode=plan.localStatus==='CLEAR'?0:2;
  } finally { if(ds.isInitialized)await ds.destroy(); }
}
main().catch(()=>{process.stderr.write('TEMP_PRODUCTION_REVERSAL_CLI=HOLD: preflight unavailable; fixed-case apply is retired; no application/background tasks started\n');process.exitCode=2;});
