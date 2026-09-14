import {PackagingWorkflowPolicy,PackingPolicy} from './packaging-workflow-policy';
import {normalizedPackingCode} from './packaging-box.service';
import {packingEvidence} from './packaging-evidence.service';
describe('D1-C policy and conservative evidence',()=>{
 const enabled:PackingPolicy={version:'TEST',R:true,B:true,P:true,V:true,H:true,Q:true,receiptMode:'C',encodingVersion:'TEST-NON-BUSINESS-v1'};
 it.each(['R','B','P','V','H','Q'])('confirm rejects missing %s',key=>{expect(()=>new PackagingWorkflowPolicy().assert({...enabled,[key]:false},'CONFIRM')).toThrow('WORKFLOW_NOT_READY');});
 it('defaults disabled with no trusted exact site policy',async()=>{expect(await new PackagingWorkflowPolicy().get('COMPANY','SITE')).toMatchObject({H:false,Q:false,B:false});});
 it('Q cannot be asserted by a boolean without physical qualification',async()=>{const p={...enabled,encodingVersion:'PBX-v1',companyCode:'C',siteCode:'F',H:false};const service=new PackagingWorkflowPolicy({query:async()=>[{config_json:p}]} as any);expect(await service.get('C','F')).toMatchObject({Q:false,H:false});});
 it('cross-site policy is rejected instead of inheriting a pilot',async()=>{const p={...enabled,companyCode:'C',siteCode:'OTHER'};await expect(new PackagingWorkflowPolicy({query:async()=>[{config_json:p}]} as any).get('C','F')).rejects.toThrow('INVALID_WORKFLOW_POLICY');});
 it('normalization preserves case and rejects internal control characters',()=>{expect(normalizedPackingCode(' TEST-Ab\r\n')).toBe('TEST-Ab');expect(()=>normalizedPackingCode('TEST-\u0001Ab')).toThrow();expect(()=>normalizedPackingCode(' ')).toThrow();});
 it('malformed original quantities never become a verified empty pending record',()=>{expect(packingEvidence({batches_json:[{eggs:31,boxes:2}],total_eggs:31,total_boxes:2},[],[],[])).toMatchObject({state:'PENDING',quality:'UNKNOWN'});});
});
