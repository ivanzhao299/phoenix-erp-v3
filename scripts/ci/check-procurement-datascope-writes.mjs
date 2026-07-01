#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const required = [
  {
    file: 'apps/api/src/modules/procurement-v2/services/requests.service.ts',
    checks: [
      ['采购申请 create/update/submit/approve/reject/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购申请/g, 6],
      ['采购申请 approval log read must enforce ownership', /getApprovals\([\s\S]*?assertOwnership\([\s\S]*?采购申请/, 1],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/orders.service.ts',
    checks: [
      ['采购订单 create/convert/update/submit/approve/reject/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购订单/g, 6],
      ['PR convert-to-order must enforce source request writable ownership', /assertWritableOwnership\([\s\S]*?采购申请/, 1],
      ['采购订单 approval/AP/process reads must enforce ownership', /getApprovals\([\s\S]*?assertOwnership\([\s\S]*?采购订单[\s\S]*?getApLedger\([\s\S]*?assertOwnership\([\s\S]*?采购订单/, 1],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/receipts.service.ts',
    checks: [
      ['采购收货 create/confirm/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购收货单/g, 3],
      ['采购收货 create/confirm/cancel must enforce writable warehouse scope', /assertWritableWarehouse\([\s\S]*?采购收货单/g, 3],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/payments.service.ts',
    checks: [
      ['采购付款 create/update/submit/approve/pay/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购付款单/g, 6],
      ['采购付款分摊 must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购付款分摊/, 1],
      ['采购付款 allocations read must enforce ownership', /getAllocations\([\s\S]*?assertOwnership\([\s\S]*?采购付款单/, 1],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/shipments.service.ts',
    checks: [
      ['采购运单 create/update/ready/dispatch/customs/arrive/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购运单/g, 7],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/projects.service.ts',
    checks: [
      ['采购项目 create must enforce writable ownership', /assertWritableOwnership\([\s\S]*?采购项目/, 1],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/suppliers.service.ts',
    checks: [
      ['采购供应商 create must enforce owner company writable ownership', /assertWritableOwnership\([\s\S]*?采购供应商/, 1],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/shareholder-funds.service.ts',
    checks: [
      ['股东资金 create/submit/cancel must enforce writable ownership', /assertWritableOwnership\([\s\S]*?股东资金/g, 3],
    ],
  },
  {
    file: 'apps/api/src/modules/procurement-v2/services/init.service.ts',
    checks: [
      ['采购初始化批次 list must apply creator scope for non-global users', /applyBatchReadScope\([\s\S]*?createQueryBuilder\('b'\)/, 1],
      ['采购初始化批次 detail/error/cancel/import must enforce creator access', /assertBatchAccess\(batch,\s*'初始化批次'\)/g, 4],
      ['采购初始化批次 must remain global-readable only for GROUP/admin scope', /isGlobalScope\(\)[\s\S]*?scope\.isGlobal/, 1],
    ],
  },
];

const findings = [];

for (const item of required) {
  const text = readFileSync(item.file, 'utf8');
  for (const [message, pattern, minimum] of item.checks) {
    const matches = text.match(pattern) ?? [];
    if (matches.length < minimum) {
      findings.push({
        file: item.file,
        message,
        expected: minimum,
        actual: matches.length,
      });
    }
  }
}

console.log(`check-procurement-datascope-writes: inspected ${required.length} service file(s)`);
console.log(`Procurement DataScope write findings: ${findings.length}`);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`FAIL ${finding.file}: ${finding.message}`);
    console.error(`  expected >= ${finding.expected}, actual ${finding.actual}`);
  }
  process.exit(1);
}

console.log('Result: PASS. Procurement write/read subresource DataScope guards are present.');
