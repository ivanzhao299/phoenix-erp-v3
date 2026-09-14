import {BadRequestException} from '@nestjs/common';
const fields:Record<string,string[]>={
 REGISTER:['registrationKind','reason','items'],SESSION:['purpose'],SCAN:['boxId','labelCode','purpose','method','sessionId'],
 PRINT:['packingCode','boxId','labelCode','printType','reason','copies','templateVersion'],
 PRINT_RESULT:['packingCode','requestId','type','clientOccurredAt'],
 CONFIRM:['contractVersion','packingCode','productionDate','shiftId','boxIds','verificationIds','warehouseCode','locationCode','receiverUserId','palletCode'],
 VOID:['labelCode','reason','dispositionDeclaration'],
};
export function validatePackingCode(code:unknown){
 if(typeof code!=='string'||!code.trim()||code.length>80)throw new BadRequestException('INVALID_PACKING_CODE');
}
export function validatePackingCommand(action:string,body:any){
 const fail=()=>{throw new BadRequestException('INVALID_COMMAND');};
 if(!body||typeof body!=='object'||Array.isArray(body)||!fields[action])return fail();
 const allowed=[...fields[action],'expectedRevision'];
 if(Object.keys(body).some(k=>!allowed.includes(k)))return fail();
 if(action!=='PRINT_RESULT'&&(typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision)))return fail();
 const text=(key:string,required=true)=>{if(body[key]===undefined&&!required)return;if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>2000)return fail();};
 const uuid=(v:any)=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))return fail();};
 const enumeration=(key:string,values:string[])=>{if(!values.includes(body[key]))return fail();};
 if(action==='REGISTER'){
  enumeration('registrationKind',['FIRST_LABEL_CONFIRMED','LEGACY_VERIFIED']);text('reason');
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>10000)return fail();
  for(const i of body.items){if(!i||Object.keys(i).some(k=>!['outputOrdinal','boxOrdinal','observedLabelCode','declaration'].includes(k))
    ||!Number.isSafeInteger(i.outputOrdinal)||i.outputOrdinal<0||!Number.isSafeInteger(i.boxOrdinal)||i.boxOrdinal<1
    ||typeof i.declaration!=='string'||!i.declaration.trim()||i.declaration.length>2000)return fail();
    if(i.observedLabelCode!==undefined&&(typeof i.observedLabelCode!=='string'||!i.observedLabelCode.trim()))return fail();
    if(body.registrationKind==='LEGACY_VERIFIED'&&!i.observedLabelCode)return fail();}
 }
 if(['SESSION','SCAN'].includes(action))enumeration('purpose',['LABEL_CHECK','HANDOVER']);
 if(action==='SCAN'){uuid(body.boxId);uuid(body.sessionId);text('labelCode');enumeration('method',['SCANNER','MANUAL']);}
 if(action==='PRINT'){uuid(body.boxId);text('labelCode');text('templateVersion');enumeration('printType',['NORMAL','REPRINT']);if(body.copies!==1)return fail();text('reason',body.printType==='REPRINT');}
 if(body.packingCode!==undefined)validatePackingCode(body.packingCode);
 if(action==='PRINT_RESULT'){uuid(body.requestId);enumeration('type',['DISPATCHED','FAILED','UNKNOWN']);if(body.clientOccurredAt!==undefined&&body.clientOccurredAt!==null&&(typeof body.clientOccurredAt!=='string'||!Number.isFinite(Date.parse(body.clientOccurredAt))))return fail();}
 if(action==='VOID'){text('labelCode');text('reason');text('dispositionDeclaration');}
 if(action==='CONFIRM'){
  for(const key of ['boxIds','verificationIds']){if(!Array.isArray(body[key])||!body[key].length||body[key].length>10000||new Set(body[key]).size!==body[key].length)return fail();body[key].forEach(uuid);}
  for(const key of ['warehouseCode','locationCode'])text(key);
  for(const key of ['shiftId','receiverUserId'])if(!/^[1-9]\d*$/.test(String(body[key]))||BigInt(body[key])>9223372036854775807n)return fail();
  if(typeof body.productionDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.productionDate)||!Number.isFinite(Date.parse(body.productionDate))||new Date(body.productionDate).toISOString().slice(0,10)!==body.productionDate)return fail();
  if(body.contractVersion!==undefined&&body.contractVersion!==2)return fail();
  if(body.palletCode!==undefined&&(typeof body.palletCode!=='string'||body.palletCode.length>64))return fail();
 }
}
