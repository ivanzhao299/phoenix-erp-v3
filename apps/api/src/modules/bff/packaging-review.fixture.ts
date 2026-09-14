import {packingHash} from './packaging-evidence.service';
// Explicit TEST-only JSON fixture; no database connections or business codes.
export function reviewEvidenceFixture(){
 const outputs=[{eggs:30,boxes:1,skuCode:'TEST-A',specId:'S',productCode:'P'},{eggs:20,boxes:1,skuCode:'TEST-B',specId:'S',productCode:'P'}];
 const record={code:'TEST-REVIEW',production_date:'2026-01-02',batches_json:outputs,total_eggs:50,total_boxes:2};
 const groups=outputs.map((o,i)=>({ledgerId:String(i+1),batchNo:`TEST-B${i}`,skuCode:o.skuCode,specCode:o.specId,productCode:o.productCode,qty:o.eggs,companyCode:'TEST-C',warehouseCode:'TEST-W',locationCode:'TEST-L'}));
 const receipt={groups,outputBindings:outputs.map((o,outputOrdinal)=>({outputOrdinal,qty:o.eggs,boxes:o.boxes,skuCode:o.skuCode,specCode:o.specId,productCode:o.productCode})),handoverCode:'TEST-H',originalHash:packingHash({date:record.production_date,outputs,totalEggs:50,totalBoxes:2})};
 const ledger=()=>groups.map(g=>({id:g.ledgerId,batch_no:g.batchNo,ref_no:record.code,qty_change:g.qty,sku_code:g.skuCode,company_code:g.companyCode,warehouse_code:g.warehouseCode,location_code:g.locationCode,change_type:'PACKAGING_INBOUND'}));
 const handovers=[{code:'TEST-H'}];return {record,groups,receipt,ledger,handovers};
}
