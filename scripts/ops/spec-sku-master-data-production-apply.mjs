#!/usr/bin/env node

const apiBase = (process.env.PHOENIX_API_BASE || 'https://erp.eggslao.com').replace(/\/$/, '');
const token = process.env.PHOENIX_ADMIN_TOKEN;
if (!token) throw new Error('PHOENIX_ADMIN_TOKEN is required');

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok || (body && typeof body === 'object' && body.code >= 400)) {
    throw new Error(`${init.method || 'GET'} ${path} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return body;
}

const unwrapRows = (body) => {
  const value = body?.data ?? body;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const specCode = 'PKG_PACK_SPEC_3';
const names = {
  zh: '精品礼盒(30枚/盒)',
  en: 'Premium Gift Box (30 eggs/box)',
  lo: 'ກ່ອງຂອງຂວັນພິເສດ (30 ໜ່ວຍ/ກ່ອງ)',
};

const specs = unwrapRows(await request('/api/product-master/specs?status=ALL'))
  .filter((row) => row.spec_code === specCode);
if (specs.length > 1) throw new Error('spec precondition failed: duplicate PKG_PACK_SPEC_3');
if (specs.length === 0) {
  const created = await request('/api/product-master/specs', {
    method: 'POST',
    body: JSON.stringify({
      spec_code: specCode, spec_name: names.zh, spec_name_en: names.en, spec_name_lo: names.lo,
      qty_per_unit: 30, base_unit: '枚', display_unit: '盒', sort_order: 30,
      status: 'ACTIVE', remark: 'SPEC-SKU-BACKFILL-20260909 approved master-data repair',
    }),
  });
  console.log('SPEC_CREATE', JSON.stringify(created));
} else {
  const row = specs[0];
  if (row.status !== 'ACTIVE' || row.spec_name !== names.zh || Number(row.qty_per_unit) !== 30) {
    throw new Error(`spec exists with unapproved values: ${JSON.stringify(row)}`);
  }
  console.log('SPEC_ALREADY_VALID', specCode);
}

for (const grade of ['GRADE_1', 'GRADE_2']) {
  const productCode = `PRD-EGG-${grade}`;
  const skus = unwrapRows(await request(`/api/product-master/skus?product_code=${productCode}&grade_code=${grade}&spec_code=${specCode}&status=ACTIVE`));
  if (skus.length > 1) throw new Error(`SKU tuple duplicate: ${productCode}/${grade}/${specCode}`);
  if (skus.length === 0) {
    // sku_code deliberately omitted: runtime CodeGeneratorService is the sole code generator
    // and its existing CREATE audit records the operator and generated code.
    const created = await request('/api/master-data/runtime/sku', {
      method: 'POST',
      body: JSON.stringify({
        product_code: productCode, grade_code: grade, spec_code: specCode,
        sku_name: `${grade} 精品礼盒(30枚/盒)`, status: 'ACTIVE',
        remark: 'SPEC-SKU-BACKFILL-20260909 approved master-data repair',
      }),
    });
    console.log('SKU_CREATE', grade, JSON.stringify(created));
  } else if (skus[0].status !== 'ACTIVE') {
    throw new Error(`SKU tuple exists but is not ACTIVE: ${JSON.stringify(skus[0])}`);
  } else {
    console.log('SKU_ALREADY_ACTIVE', grade, skus[0].sku_code);
  }
}

const dictRows = unwrapRows(await request('/api/crud/sys_dict?limit=1000'))
  .filter((row) => row.dict_type === 'PKG_PACK_SPEC' && row.dict_code === specCode);
if (dictRows.length !== 1 || !dictRows[0].id) throw new Error(`dictionary precondition failed: count=${dictRows.length}`);
const dict = dictRows[0];
const config = typeof dict.config_json === 'string' ? JSON.parse(dict.config_json || '{}') : (dict.config_json || {});
const updated = await request(`/api/crud/sys_dict/${dict.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: names.zh, dict_label_zh: names.zh, dict_label_en: names.en, dict_label_lo: names.lo,
    dict_type: 'PKG_PACK_SPEC', sort_no: Number(dict.sort_no) || 0, status: 'ACTIVE',
    config_json: JSON.stringify({ ...config, name: names.zh, capacity: 30, unit: '枚', requireBoxCode: config.requireBoxCode !== false }),
  }),
});
console.log('DICT_UPDATE', JSON.stringify(updated));
console.log('MASTER_DATA_APPLY_COMPLETE');
