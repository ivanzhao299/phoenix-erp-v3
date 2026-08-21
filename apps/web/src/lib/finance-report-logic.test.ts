import { describe, expect, it } from 'vitest';
import { arLedgerQuery, financeAlignmentSummary, financeSourceLabel, financeStatusLabel, pendingOcrCount } from './finance-report-logic';
describe('finance report page logic', () => {
  it.each([[undefined,''],['CHANJET','好业财口径'],['CHANJET_VERIFIED','好业财口径'],['ERP_FALLBACK','ERP回退'],['OTHER_SOURCE','OTHER SOURCE']] as const)('source %#', (v,e)=>expect(financeSourceLabel(v)).toBe(e));
  it.each([['OK','已对齐'],['WARN','小差异'],['MISMATCH','需对账'],['HOLD','暂停'],['READONLY_READY','只读就绪'],['UNKNOWN','UNKNOWN'],[undefined,'未确认']] as const)('status %#',(v,e)=>expect(financeStatusLabel(v)).toBe(e));
  it.each([
    [['OK'],{status:'AUTHORITY_READY',label:'权威可用'}], [['READONLY_READY'],{status:'READONLY_READY',label:'仅只读可用'}],
    [['WARN','HOLD'],{status:'HOLD',label:'暂停升权'}], [['WARN'],{status:'WARN',label:'存在差异'}],
    [['WARN','MISMATCH'],{status:'MISMATCH',label:'存在差异'}], [['NEEDS_MAPPING'],{status:'BLOCKED_MAPPING',label:'待字段锁定'}],
    [[],{status:'AUTHORITY_READY',label:'权威可用'}],
  ] as const)('alignment %#',(v,e)=>expect(financeAlignmentSummary([...v])).toEqual(e));
  it.each([['','','/v2/finance/ar-ledger'],['F A','','/v2/finance/ar-ledger?farmCode=F+A'],['','2026-08-01','/v2/finance/ar-ledger?periodDate=2026-08-01'],['F1','2026-08-01','/v2/finance/ar-ledger?farmCode=F1&periodDate=2026-08-01']])('query %#',(f,p,e)=>expect(arLedgerQuery(f,p)).toBe(e));
  it('counts pending OCR',()=>expect(pendingOcrCount([{source:'OCR_PENDING_VERIFY'},{source:'VERIFIED'},{source:'OCR_PENDING_VERIFY'}])).toBe(2));
});
