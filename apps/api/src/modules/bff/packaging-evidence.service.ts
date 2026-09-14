import { createHash } from 'crypto';

export function packingHash(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function originalOutputs(record: any): any[] | null {
  const rows = record.batches_json;
  if (!Array.isArray(rows) || !rows.length || rows.some(b => !b || !Number.isSafeInteger(b.boxes) || b.boxes <= 0
    || !Number.isSafeInteger(b.eggs) || b.eggs <= 0 || b.eggs % b.boxes !== 0)) return null;
  if (rows.reduce((n, b) => n + b.boxes, 0) !== Number(record.total_boxes)
    || rows.reduce((n, b) => n + b.eggs, 0) !== Number(record.total_eggs)) return null;
  return rows;
}
export function completePackingSources(record:any):boolean {
  const codes=Array.isArray(record.grading_codes_json)&&record.grading_codes_json.length?record.grading_codes_json:[record.grading_code];
  const sources=record.sources;
  if(!codes.length||codes.some((c:any)=>typeof c!=='string'||!c.trim())||new Set(codes).size!==codes.length||!Array.isArray(sources)||!sources.length)return false;
  const actual=[...new Set(sources.map(s=>s.gradingCode))].sort();
  return JSON.stringify([...codes].sort())===JSON.stringify(actual)&&sources.every(s=>s.sourceBatchId&&s.companyCode&&s.siteCode
    &&s.gradingShiftId===record.shift_id&&s.sourceShiftId===record.shift_id&&s.gradingDate===record.production_date&&s.sourceDate===record.production_date&&s.siteCode===record.site_id&&s.companyCode===record.company_code
    &&s.gradingStatus==='ACTIVE'&&!s.isTest&&s.sourceStatus&&s.sourceStatus!=='VOID');
}
/** Original posting and current availability are independent. This never repairs evidence. */
export function packingEvidence(record: any, batches: any[], ledger: any[], handovers: any[], receipt?: any) {
  const outputs = originalOutputs(record);
  const pending = !batches.length && !ledger.length && !handovers.length;
  const state = pending ? 'PENDING' : handovers.length ? 'HANDOVER_ONLY' : 'INVENTORY_ONLY';
  const invalid = (issue: string) => ({ state, quality: 'UNKNOWN', postingQuality: 'UNKNOWN', currentInventoryQuality: 'UNKNOWN', issues: [issue] });
  if (!outputs) return invalid('原产出数量或结构无法核实');
  if (pending) return { state, quality: 'VERIFIED', postingQuality: 'VERIFIED', currentInventoryQuality: 'VERIFIED', issues: [] };
  if (handovers.length !== 1) return invalid('证据不完整，已停止操作，请联系负责人核实');
  const inbound = ledger.filter(l => l.change_type === 'PACKAGING_INBOUND');
  if (receipt) {
    const groups = receipt.groups;
    if (!Array.isArray(groups) || !groups.length || new Set(groups.map(g=>g.ledgerId)).size!==groups.length
      || new Set(groups.map(g=>g.batchNo)).size!==groups.length || new Set(groups.map(g=>`${g.skuCode}/${g.specCode}`)).size!==groups.length
      || groups.some(g=>!Number.isSafeInteger(g.qty)||g.qty<=0)||groups.reduce((n,g)=>n+g.qty,0)!==Number(record.total_eggs)
      || receipt.originalHash !== packingHash({ date: record.production_date, outputs,
      totalEggs: Number(record.total_eggs), totalBoxes: Number(record.total_boxes) })
      || receipt.handoverCode !== handovers[0].code || inbound.length !== groups.length
      || groups.some(g => !inbound.some(l => String(l.id) === g.ledgerId && l.batch_no === g.batchNo && l.ref_no === record.code
        && Number(l.qty_change) === g.qty && l.sku_code === g.skuCode && l.company_code === g.companyCode
        && l.warehouse_code === g.warehouseCode && l.location_code === g.locationCode))) return invalid('原入账凭据与流水不一致');
    // Retain immutable posting even if current stock evolved; don't claim an unexplained evolution was verified.
    const current = groups.every(g => batches.some(b => b.batch_no === g.batchNo && b.company_code === g.companyCode
      && b.warehouse_code === g.warehouseCode && b.location_code === g.locationCode && Number(b.qty) === g.qty));
    return { state: 'COMMITTED', quality: 'VERIFIED', postingQuality: 'VERIFIED', currentInventoryQuality: current ? 'VERIFIED' : 'UNKNOWN', issues: current ? [] : ['当前库存演进需核实，原入账凭据保留'] };
  }
  // Legacy evidence without a snapshot: don't infer identities from equal grand totals.
  const groups = new Map<string, number>();
  for (const o of outputs) {
    if (!o.skuCode || !o.specId || !o.productCode) return invalid('旧原单缺不可变产出身份，原入账证据待核实');
    const key = `${o.skuCode}/${o.specId}/${o.productCode}`;
    groups.set(key, (groups.get(key) || 0) + o.eggs);
  }
  const h = handovers[0];
  const ok = Number(h.box_count) === Number(record.total_boxes) && h.production_date === record.production_date
    && batches.length === groups.size && inbound.length === groups.size
    && new Set(batches.map(b=>`${b.sku_code}/${b.spec_code}/${b.product_code}`)).size===groups.size
    && new Set(batches.map(b=>b.batch_no)).size===groups.size && new Set(inbound.map(l=>String(l.id))).size===groups.size
    && batches.every(b => {
      const expected = groups.get(`${b.sku_code}/${b.spec_code}/${b.product_code}`);
      const entries = inbound.filter(l => l.batch_no === b.batch_no);
      if (!expected || Number(b.qty) !== expected || b.egg_date !== record.production_date || b.location_code !== h.location
        || b.source_type !== 'PACKAGING' || b.packaging_batch_ref !== record.code || entries.length !== 1) return false;
      const l = entries[0];
      return l.ref_no === record.code && Number(l.qty_change) === expected && l.sku_code === b.sku_code
        && l.company_code === b.company_code && l.warehouse_code === b.warehouse_code && l.location_code === h.location;
    });
  return ok ? { state: 'COMMITTED', quality: 'VERIFIED', postingQuality: 'LEGACY_VERIFIED', currentInventoryQuality: 'VERIFIED', issues: [] }
    : invalid('证据不完整，已停止操作，请联系负责人核实');
}
