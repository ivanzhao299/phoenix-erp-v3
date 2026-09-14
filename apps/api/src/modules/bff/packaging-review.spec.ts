import {packingPrintBlocked} from './packaging-print-state';
import {packingEvidence,packingHash} from './packaging-evidence.service';
import {PackagingHistoryD1cEvidence1789353300496} from '../../database/migrations/1789353300496-PackagingHistoryD1cEvidence';
import {reviewEvidenceFixture} from './packaging-review.fixture';
describe('review printing without physical claims',()=>{
 const request={id:'R',box_id:'B',event_type:'PRINT_REQUEST'};
 const result=(type:string)=>({event_type:'PRINT_RESULT',payload:{requestId:'R',type}});
 it('first print has no unresolved request',()=>expect(packingPrintBlocked([],'B')).toBe(false));
 it.each([{events:[]},{events:[result('UNKNOWN')]},{events:[result('INVALID')]}])('blocks absent or unknown result %j',({events})=>expect(packingPrintBlocked([request,...events],'B')).toBe(true));
 it.each(['FAILED','DISPATCHED'])('known %s result permits reasoned same-code retry',type=>expect(packingPrintBlocked([request,result('UNKNOWN'),result(type)],'B')).toBe(false));
 it('result for another request cannot clear the original unknown',()=>expect(packingPrintBlocked([request,{...result('FAILED'),payload:{requestId:'OTHER',type:'FAILED'}}],'B')).toBe(true));
 it('a later unknown result conservatively blocks',()=>expect(packingPrintBlocked([request,result('DISPATCHED'),result('UNKNOWN')],'B')).toBe(true));
});
describe('review immutable evidence counterexamples (pure JS, not PG)',()=>{
 it('retains original committed with no current stock',()=>{const f=reviewEvidenceFixture();expect(packingEvidence(f.record,[],f.ledger(),f.handovers,f.receipt)).toMatchObject({state:'COMMITTED',currentInventoryQuality:'UNKNOWN'});});
 it.each([null,0,-1,1.5,'30',9007199254740992])('rejects malformed group quantity %s',qty=>{const f=reviewEvidenceFixture();(f.groups[0] as any).qty=qty;expect(packingEvidence(f.record,[],f.ledger(),f.handovers,f.receipt).quality).toBe('UNKNOWN');});
 it('rejects equal grand total with reassigned original group quantities',()=>{const f=reviewEvidenceFixture();f.groups[0].qty=20;f.groups[1].qty=30;expect(packingEvidence(f.record,[],f.ledger(),f.handovers,f.receipt).quality).toBe('UNKNOWN');});
 it.each(['ledgerId','batchNo','skuCode','specCode','productCode','companyCode','warehouseCode','locationCode'])('rejects empty receipt %s',field=>{const f=reviewEvidenceFixture();(f.groups[0] as any)[field]='';expect(packingEvidence(f.record,[],f.ledger(),f.handovers,f.receipt).quality).toBe('UNKNOWN');});
 it('rejects null group without throwing',()=>{const f=reviewEvidenceFixture();(f.receipt.groups as any)[0]=null;expect(packingEvidence(f.record,[],[],f.handovers,f.receipt).quality).toBe('UNKNOWN');});
 it('retains committed snapshot for old original without SKU',()=>{const f=reviewEvidenceFixture();for(const o of f.record.batches_json)delete (o as any).skuCode;f.receipt.originalHash=packingHash({date:f.record.production_date,outputs:f.record.batches_json,totalEggs:50,totalBoxes:2});expect(packingEvidence(f.record,[],f.ledger(),f.handovers,f.receipt).state).toBe('COMMITTED');});
 it('emits SQL quantity/type/group guards (static only; SQL not executed)',async()=>{const queries:string[]=[];await new PackagingHistoryD1cEvidence1789353300496().up({query:async(s:string)=>{queries.push(s);return [];}} as any);const sql=queries.find(q=>q.includes('FUNCTION packing_posting_state'))!;expect(sql).toContain("jsonb_typeof(g->'qty') IS DISTINCT FROM 'number'");expect(sql).toContain('9007199254740991');expect(sql).toContain("e->>'product'=g->>'productCode'");expect(sql).toContain("o->>'skuCode'=''");});
});

describe('PRINT command wiring without DB (mock transaction)',()=>{
 it.each(['NORMAL','REPRINT'])('rejects %s after locking before label resolution or event insert',async printType=>{
  const {PackagingHandoverService}=await import('./packaging-handover.service');
  const query=jest.fn(async(..._args:any[])=>[]),db={query};
  const row={id:'1',status:'ACTIVE',production_date:'2026-01-02',shift_date:'2026-01-02',shift_id:1,company_code:'TEST-C',site_id:'TEST-F',grading_code:'TEST-G',sources:[{gradingCode:'TEST-G',sourceBatchId:'1',companyCode:'TEST-C',siteCode:'TEST-F',gradingShiftId:1,sourceShiftId:1,gradingDate:'2026-01-02',sourceDate:'2026-01-02',gradingStatus:'ACTIVE',isTest:false,sourceStatus:'ACTIVE'}]};
  const history={scope:async()=>({}),rows:async()=>[row],em:{transaction:async(fn:any)=>fn(db)}};
  const boxes={resolve:jest.fn()},policy={get:async()=>({}),assert:()=>{}};
  const workflow=new PackagingHandoverService(history as any,boxes as any,policy as any,{} as any);
  const boxId='12345678-1234-4123-8123-123456789abc';
  jest.spyOn(workflow,'detail').mockResolvedValue({revision:'a'.repeat(64),handover:{quality:'VERIFIED'},events:[{id:'TEST-REQUEST',event_type:'PRINT_REQUEST',box_id:boxId},{event_type:'PRINT_RESULT',payload:{requestId:'TEST-REQUEST',type:'UNKNOWN'}}]});
  await expect(workflow.command('PRINT','TEST-P',boxId,{expectedRevision:'a'.repeat(64),boxId,labelCode:'TEST-L',printType,reason:'TEST',copies:1,templateVersion:'TEST'},{user:{id:'1'}})).rejects.toThrow('PRINT_RESULT_UNRESOLVED');
  expect(boxes.resolve).not.toHaveBeenCalled();expect(query.mock.calls.some(call=>String(call[0]).includes('INSERT INTO pkg_packing_events'))).toBe(false);
 });
});

describe('operation response completeness (pure controller)',()=>{
 it.each([null,[],false,'wrong'].map(result=>({result})))('never reports a committed operation with invalid result %j',async ({result})=>{
  const {PackagingHistoryController}=await import('./packaging-history.controller');
  const controller=new PackagingHistoryController({detail:async()=>({record:{id:'1'}}),em:{query:async()=>[{state:'COMMITTED',eventId:'e',result}]}} as any,{} as any);
  await expect(controller.operation('12345678-1234-4123-8123-123456789abc',{packingCode:'TEST',action:'CONFIRM'},{user:{id:'1'}})).rejects.toThrow('OPERATION_INCOMPLETE');
 });
});
