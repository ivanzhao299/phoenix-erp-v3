/** Persistent psql transport for fixed reviewed collectors. No DB credential
 * leaves the DB container, no host pg dependency, no raw SQL/error logging.
 * PostgreSQL enforces read-only; this internal adapter is not a user SQL API. */
import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import {createInterface} from 'node:readline';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
const fail=code=>Error('MODERN_SCHEMA_READ_HOLD='+code);
const textLiteral=value=>"convert_from(decode('"+Buffer.from(value,'utf8').toString('hex')+"','hex'),'UTF8')";
function parameter(value){
 if(value===null)return 'NULL';if(typeof value==='string'&&!value.includes('\0')&&Buffer.byteLength(value)<=65536)return textLiteral(value);
 if(typeof value==='boolean')return value?'true':'false';if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(Array.isArray(value)&&value.length<=1024&&value.every(item=>typeof item==='string'&&!item.includes('\0')&&Buffer.byteLength(item)<=65536)
  &&value.reduce((sum,item)=>sum+Buffer.byteLength(item),0)<=65536)return 'ARRAY['+value.map(textLiteral).join(',')+']::text[]';
 throw fail('FIXED_PARAMETER_TYPE_REQUIRED');
}
/** Lexical replacement outside SQL strings/identifiers/comments only. Reject
 * extra statements and psql commands; values never enter SQL as executable text. */
export function bindModernSchemaReadSql(sql,parameters=[]){
 if(typeof sql!=='string'||Buffer.byteLength(sql)>131072||sql.includes('\0')||!Array.isArray(parameters))throw fail('FIXED_QUERY_REQUIRED');
 let out='',i=0,state='NORMAL',dollar='',semicolons=0;const used=new Set();
 while(i<sql.length){
  const ch=sql[i],next=sql[i+1];
  if(state==='LINE'){out+=ch;i++;if(ch==='\n')state='NORMAL';continue;}
  if(state==='BLOCK'){if(ch==='*'&&next==='/'){out+='*/';i+=2;state='NORMAL';}else{out+=ch;i++;}continue;}
  if(state==='SINGLE'||state==='DOUBLE'){
   const quote=state==='SINGLE'?"'":'"';out+=ch;i++;if(ch===quote){if(sql[i]===quote){out+=sql[i++];}else state='NORMAL';}continue;
  }
  if(state==='DOLLAR'){if(sql.startsWith(dollar,i)){out+=dollar;i+=dollar.length;state='NORMAL';}else{out+=ch;i++;}continue;}
  if(ch==='-'&&next==='-'){out+='--';i+=2;state='LINE';continue;}if(ch==='/'&&next==='*'){out+='/*';i+=2;state='BLOCK';continue;}
  if(ch==="'"||ch==='"'){state=ch==="'"?'SINGLE':'DOUBLE';out+=ch;i++;continue;}
  if(ch==='$'){
   const marker=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);if(marker){dollar=marker[0];state='DOLLAR';out+=dollar;i+=dollar.length;continue;}
   const placeholder=sql.slice(i).match(/^\$([1-9][0-9]*)/);if(placeholder){const index=Number(placeholder[1])-1;if(index>=parameters.length)throw fail('QUERY_PARAMETER_MISMATCH');out+=parameter(parameters[index]);used.add(index);i+=placeholder[0].length;continue;}
  }
  if(ch==='\\')throw fail('PSQL_META_COMMAND_FORBIDDEN');
  if(ch===';'){semicolons++;if(sql.slice(i+1).trim())throw fail('SINGLE_READ_STATEMENT_REQUIRED');i++;continue;}
  out+=ch;i++;
 }
 if(!['NORMAL','LINE'].includes(state)||semicolons>1||used.size!==parameters.length)throw fail('SINGLE_READ_STATEMENT_REQUIRED');
 if(!/^\s*(?:SELECT|WITH)\b/i.test(out))throw fail('READ_STATEMENT_REQUIRED');if(Buffer.byteLength(out)>262144)throw fail('EXPANDED_QUERY_SIZE');return out.trim();
}
function controlStatement(sql){
 const text=sql.trim().replace(/;$/,'').trim();
 if(/^(?:BEGIN(?: ISOLATION LEVEL REPEATABLE READ)? READ ONLY|ROLLBACK)$/i.test(text))return text+';';
 const pieces=text.split(';').map(x=>x.trim());
 if(pieces.length&&pieces.every(piece=>/^SET LOCAL (?:search_path\s*=\s*(?:public|pg_catalog)|row_security\s*=\s*off|max_parallel_workers_per_gather\s*=\s*0|TimeZone\s*=\s*'UTC'|DateStyle\s*=\s*'ISO,YMD'|IntervalStyle\s*=\s*'iso_8601'|bytea_output\s*=\s*'hex'|extra_float_digits\s*=\s*3|(?:statement_timeout|lock_timeout)\s*=\s*'[1-9][0-9]*(?:ms|s)')$/i.test(piece)))return pieces.join('; ')+';';
 return null;
}
export class ModernSchemaReadClient {
 constructor(dependencies={}){
  this.guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,CONTRACT.stateDirectory));this.launch=dependencies.spawn??spawn;
  this.databaseContainer=dependencies.databaseContainer??'phoenix-v3-db';
  if(this.databaseContainer!=='phoenix-v3-db'&&!/^[a-f0-9]{64}$/.test(this.databaseContainer))throw fail('EXACT_DATABASE_CONTAINER_REQUIRED');
  this.child=null;this.pending=null;this.queue=Promise.resolve();this.broken=false;this.sequence=0;this.nonce=randomBytes(16).toString('hex');
 }
 async start(){
  this.guard();if(this.child||this.broken)throw fail('CLIENT_REUSE');
  this.child=this.launch('/usr/bin/docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on -c idle_in_transaction_session_timeout=25000 -c statement_timeout=20000 -c TimeZone=UTC -c DateStyle=ISO,YMD -c IntervalStyle=iso_8601 -c bytea_output=hex -c extra_float_digits=3',
   '-e','PGAPPNAME=phoenix-modern-schema-read',this.databaseContainer,'sh','-c','exec env -i PATH=/usr/local/bin:/usr/bin:/bin PGHOST=/var/run/postgresql PGPORT=5432 PGOPTIONS="$PGOPTIONS" PGAPPNAME="$PGAPPNAME" psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{env:executionEnv(),stdio:['pipe','pipe','pipe']});
  const lose=()=>{this.broken=true;this.pending?.reject(fail('DATABASE_CHANNEL_LOST'));try{this.child?.stdin.end();}catch{}};this.child.on('error',lose);this.child.on('exit',lose);this.child.stdin.on('error',lose);
  this.child.stderr.on('data',()=>{});let streamBytes=0;
  this.child.stdout.on('data',chunk=>{streamBytes+=chunk.length;if(streamBytes>16*1024*1024){this.broken=true;this.pending?.reject(fail('FRAME_SIZE'));this.child.stdout.destroy();try{this.child.stdin.end();}catch{}}});
  const lines=createInterface({input:this.child.stdout});this.resetFrame=()=>{streamBytes=0;};lines.on('line',line=>{
   const p=this.pending;if(!p){lose();return;}
   if(line===p.tag+':START'&&!p.started){p.started=true;return;}
   if(line===p.tag+':END'&&p.started){this.pending=null;p.resolve({rows:p.rows});return;}
   if(!p.started){lose();return;}try{const row=JSON.parse(line);if(!row||Object.getPrototypeOf(row)!==Object.prototype)throw Error();p.rows.push(row);}catch{lose();}
  });
  const {rows:[handshake]}=await this.query("SELECT current_setting('default_transaction_read_only')='on' AS readonly,NOT pg_is_in_recovery() AS primary");
  if(handshake.readonly!==true||handshake.primary!==true){await this.close();throw fail('PRIMARY_READONLY_CHANNEL_REQUIRED');}return this;
 }
 query(sql,parameters=[]){
  const control=controlStatement(sql),statement=control??`SELECT row_to_json(phoenix_read_row)::text FROM (${bindModernSchemaReadSql(sql,parameters)}\n) AS phoenix_read_row;`;
  if(control&&parameters.length)throw fail('QUERY_PARAMETER_MISMATCH');
  const work=this.queue.then(()=>{
   this.guard();if(this.broken||!this.child||this.child.exitCode!==null||this.pending)throw fail('DATABASE_CHANNEL_LOST');
   return new Promise((resolve,reject)=>{
    const tag=this.nonce+':'+(++this.sequence),timer=setTimeout(()=>{this.broken=true;this.pending=null;this.child.stdin.end();reject(fail('READ_DEADLINE'));},25000);
    this.resetFrame();
    this.pending={tag,started:false,bytes:0,rows:[],resolve:value=>{clearTimeout(timer);try{this.guard();resolve(value);}catch{reject(fail('ROOT_CONTEXT_LOST'));}},reject:error=>{clearTimeout(timer);this.pending=null;reject(error);}};
    this.child.stdin.write(`SELECT '${tag}:START';\n${statement}\nSELECT '${tag}:END';\n`,error=>{if(error)this.pending?.reject(fail('DATABASE_CHANNEL_LOST'));});
   });
  });this.queue=work.catch(()=>{});return work;
 }
 async close(){
  this.broken=true;this.pending?.reject(fail('CLIENT_CLOSED'));this.pending=null;const child=this.child;if(!child)return;
  child.stdin.end();if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('CHANNEL_CLOSE_UNVERIFIED')),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});this.child=null;
 }
}
