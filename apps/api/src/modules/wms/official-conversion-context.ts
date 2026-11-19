import { ConflictException } from '@nestjs/common';
import { EntityManager,QueryRunner } from 'typeorm';

type Row=Record<string,any>;
type Capability={runner:QueryRunner;document:Row;actorId:string;username:string;started:Set<number>;completed:Set<number>};
const capabilities=new WeakMap<EntityManager,Capability>();
const freeze=(value:any):any=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

/** The manager and persisted approved group are the capability. No DTO flag grants inventory creation. */
export async function withApprovedInventoryConversion<T>(m:EntityManager,documentId:string,actorId:string,work:()=>Promise<T>):Promise<T>{
  if(!m.queryRunner?.isTransactionActive||capabilities.has(m))throw new ConflictException('OFFICIAL_CONVERSION_TRANSACTION_REQUIRED');
  const [document]=await m.query(`SELECT *,expected_posting_date::text AS expected_posting_date FROM production_conversion_documents WHERE id=$1 FOR UPDATE`,[documentId]);
  const [actor]=await m.query("SELECT username FROM sys_user WHERE user_id::text=$1 AND status::text IN('1','ACTIVE') FOR SHARE",[actorId]);
  if(!document||document.state!=='APPROVED'||document.approved_hash!==document.content_hash||!actor)
    throw new ConflictException('OFFICIAL_CONVERSION_APPROVED_GROUP_REQUIRED');
  const inputs=await m.query('SELECT * FROM production_conversion_inputs WHERE document_id=$1 ORDER BY line_no',[documentId]);
  if(!inputs.length||inputs.length!==document.payload.inputs.length||inputs.some((i:Row)=>i.parent_batch_no&&i.inventory_ledger_id===null))
    throw new ConflictException('OFFICIAL_CONVERSION_ACTUAL_INPUTS_REQUIRED');
  const cap:Capability={runner:m.queryRunner,document:freeze(document),actorId,username:actor.username,started:new Set(),completed:new Set()};
  capabilities.set(m,cap);
  try{
    const result=await work();const expected=document.payload.outputs.map((o:Row,index:number)=>o.outputKind==='LOSS'?null:index+1).filter((n:number|null)=>n!==null);
    if(expected.length!==cap.completed.size||expected.some((n:number)=>!cap.completed.has(n)))throw new ConflictException('OFFICIAL_CONVERSION_OUTPUTS_INCOMPLETE');
    return result;
  }finally{capabilities.delete(m);}
}

export function beginApprovedConversionOutput(m:EntityManager,documentId:string,lineNo:number){
  const cap=capabilities.get(m);
  if(!cap||m.queryRunner!==cap.runner||!cap.runner.isTransactionActive||cap.document.id!==documentId
    ||!Number.isSafeInteger(lineNo)||lineNo<1||cap.started.has(lineNo))throw new ConflictException('OFFICIAL_CONVERSION_OUTPUT_CAPABILITY_REQUIRED');
  const planned=cap.document.payload.outputs[lineNo-1];
  if(!planned||!['STOCK','WIP'].includes(planned.outputKind))throw new ConflictException('OFFICIAL_CONVERSION_STOCK_OUTPUT_REQUIRED');
  cap.started.add(lineNo);return {document:cap.document,planned,actorId:cap.actorId,username:cap.username};
}
export function completeApprovedConversionOutput(m:EntityManager,lineNo:number){
  const cap=capabilities.get(m);if(!cap?.started.has(lineNo)||cap.completed.has(lineNo))throw new ConflictException('OFFICIAL_CONVERSION_OUTPUT_CAPABILITY_REQUIRED');
  cap.completed.add(lineNo);
}
