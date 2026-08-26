#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const checks = [
  {
    file: 'apps/api/src/modules/wms/wms.service.ts',
    required: [
      'private async assertWritableWarehouse',
      'scope.allowedWarehouseCodes.includes(warehouseCode)',
      'this.assertWritableWarehouse(task.warehouse_code || null',
      'this.assertWritableWarehouse(warehouseCode, `入库明细',
      'this.assertWritableWarehouse(warehouseCode, `采购收货',
      'this.assertWritableWarehouse(batch.warehouse_code, `出库批次',
      'this.assertWritableWarehouse(rows[0].warehouse_code || null, `收货单',
      'this.assertWritableWarehouse(from_warehouse,',
      'this.assertWritableWarehouse(to_warehouse,',
      'this.assertWritableWarehouse(src.warehouse_code, `调拨源批次',
      'this.assertWritableWarehouse(stocktakeRows[0].warehouse_code || null',
      'this.assertWritableWarehouse(batch.warehouse_code, `盘点批次',
      'this.assertWritableWarehouse(lossRows[0].warehouse_code || null',
      'this.assertWritableWarehouse(batch.warehouse_code, `损耗批次',
    ],
  },
  {
    file: 'apps/api/src/modules/wms/inventory/inventory.service.ts',
    required: [
      'private assertWritableWarehouse',
      'scope.allowedWarehouseCodes.includes(warehouseCode)',
      "this.assertWritableWarehouse(dto.warehouse_code, '库存扣减')",
      "this.assertWritableWarehouse(dto.warehouse_code, '库存入库')",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const needle of check.required) {
    if (!source.includes(needle)) {
      failures.push(`${check.file}: missing ${needle}`);
    }
  }
}

if (failures.length > 0) {
  console.error('FAIL: WMS DataScope write gate failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: WMS DataScope write gate passed.');
