import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface ReferenceItem {
  refTable: string;
  refDocType: string;
  refCount: number;
  example: string[];   // 示例编号（最多 5 条）
  linkPattern: string; // 前端跳转模式（含 :code 占位符）
}

export interface ReferenceReport {
  objectType: string;
  objectCode: string;
  totalReferences: number;
  references: ReferenceItem[];
  isReferenced: boolean;
  canArchive: boolean;
  asOf: string;
}

/**
 * G5.5-C — 引用关系中心
 *
 * 输入：(objectType, objectCode) 如 ('CUSTOMER', 'CUS-00001')
 * 输出：所有引用该主数据的业务单据
 *
 * 用途：
 *   1. 主数据详情页"被引用"标签页（点击跳转业务单据）
 *   2. 归档前阻断：被引用的主数据不允许归档
 *   3. 数据质量告警：冻结/归档但被引用 = HIGH 风险
 *
 * 业务表引用映射（手工维护，新增业务表时需扩展）：
 */
const REFERENCE_MAP: Record<string, Array<{
  refTable: string;
  refDocType: string;
  fkColumn: string;
  predicate?: string; // Static trusted predicate for exact JSON references.
  noField: string;     // 业务单号字段
  linkPattern: string; // 前端跳转 URL 模式
}>> = {
  CUSTOMER: [
    // FIX UAT-1 2026-06-04: 实际表名 sal_sales_orders
    // FIX UAT-P0-Phase1 2026-06-04: 实际列名 order_no（不是 so_no）
    { refTable: 'sal_sales_orders', refDocType: '销售订单', fkColumn: 'customer_code', noField: 'order_no',    linkPattern: '/sales2/orders?keyword=:code' },
    { refTable: 'fin_ar_invoices',  refDocType: 'AR 发票',  fkColumn: 'customer_code', noField: 'ar_no',       linkPattern: '/finance2/ar?keyword=:code' },
    { refTable: 'fin_ar_receipts',  refDocType: '收款单',   fkColumn: 'customer_code', noField: 'receipt_no',  linkPattern: '/finance2/ar?keyword=:code' },
    { refTable: 'wms_outbound',     refDocType: '出库单',   fkColumn: 'dest',          noField: 'outbound_no', linkPattern: '/warehouse/outbound?keyword=:code' },
  ],
  SUPPLIER: [
    // FIX UAT-1 2026-06-04: 实际表名 prc2_purchase_orders / prc2_payments
    { refTable: 'prc2_purchase_orders', refDocType: '采购订单',   fkColumn: 'supplier_code', noField: 'po_no',  linkPattern: '/procurement2/orders?keyword=:code' },
    { refTable: 'fin_ap_invoices',      refDocType: 'AP 发票',    fkColumn: 'supplier_code', noField: 'ap_no',  linkPattern: '/finance2/ap?keyword=:code' },
    { refTable: 'prc2_payments',        refDocType: '采购付款单', fkColumn: 'payee_name',    noField: 'pay_no', linkPattern: '/procurement2/payments?keyword=:code' },
  ],
  PROJECT: [
    // FIX UAT-1 2026-06-04: 表名对齐
    // FIX UAT-P0-Phase1 2026-06-04: 列名 order_no
    { refTable: 'sal_sales_orders',              refDocType: '销售订单', fkColumn: 'project_code', noField: 'order_no',        linkPattern: '/sales2/orders?keyword=:code' },
    { refTable: 'prc2_purchase_orders',          refDocType: '采购订单', fkColumn: 'project_code', noField: 'po_no',           linkPattern: '/procurement2/orders?keyword=:code' },
    { refTable: 'fin_shareholder_contributions', refDocType: '股东出资', fkColumn: 'project_code', noField: 'contribution_no', linkPattern: '/finance2/shareholder-funds?keyword=:code' },
  ],
  CASH_ACCOUNT: [
    { refTable: 'fin_cash_transactions', refDocType: '资金流水', fkColumn: 'account_id', noField: 'txn_no', linkPattern: '/finance2/fund-transfers?keyword=:code' },
    { refTable: 'fin_fund_transfers',    refDocType: '资金调拨', fkColumn: 'from_account_id', noField: 'transfer_no', linkPattern: '/finance2/fund-transfers?keyword=:code' },
    { refTable: 'fin_reimbursements',    refDocType: '报销付款', fkColumn: 'cash_account_id', noField: 'reimb_no', linkPattern: '/finance2/reimbursements?keyword=:code' },
  ],
  MATERIAL: [
    // Legacy polymorphic item columns have no reliable type: matching code conservatively blocks archival.
    { refTable:'wms_inbound',refDocType:'入库待办（多态编码待核）',fkColumn:'item',noField:'task_no',linkPattern:'/warehouse/inbound' },
    { refTable:'wms_inbound_items',refDocType:'入库明细（多态编码待核）',fkColumn:'product_code',noField:'id::text',linkPattern:'/warehouse/inbound' },
    { refTable:'wms_outbound_items',refDocType:'出库明细（多态编码待核）',fkColumn:'product_code',noField:'id::text',linkPattern:'/warehouse/outbound' },

    { refTable: 'prc2_request_items', refDocType: '采购申请明细', fkColumn: 'item_code', noField: 'id::text', linkPattern: '/procurement2/requests' },
    { refTable: 'prc2_order_items', refDocType: '采购订单明细', fkColumn: 'item_code', noField: 'id::text', linkPattern: '/procurement2/orders' },
    { refTable: 'prc2_receipt_items', refDocType: '采购收货明细', fkColumn: 'item_code', noField: 'id::text', linkPattern: '/procurement2/receipts' },
    { refTable: 'inv_batches', refDocType: '库存批次', fkColumn: 'material_code', noField: 'batch_no', linkPattern: '/warehouse' },
    { refTable: 'inv_ledger', refDocType: '库存流水', fkColumn: 'material_code', noField: 'id::text', linkPattern: '/warehouse' },
    { refTable: 'wms_outbound', refDocType: '出库单', fkColumn: 'material_code', noField: 'outbound_no', linkPattern: '/warehouse/outbound' },
  ],
  PRODUCT: [
    { refTable:'wms_inbound',refDocType:'入库单（多态编码待核）',fkColumn:'item',noField:'task_no',linkPattern:'/warehouse/inbound' },
    { refTable:'wms_outbound',refDocType:'出库单（多态编码待核）',fkColumn:'item',noField:'outbound_no',linkPattern:'/warehouse/outbound' },
    { refTable:'pkg_packing_records',refDocType:'包装产品来源',fkColumn:'batches_json',noField:'code',linkPattern:'/packaging',
      predicate: `jsonb_path_exists(batches_json,'$.**.productCode ? (@ == $code)',jsonb_build_object('code',to_jsonb($1::text))) OR jsonb_path_exists(batches_json,'$.**.product_code ? (@ == $code)',jsonb_build_object('code',to_jsonb($1::text)))` },

    { refTable: 'product_skus', refDocType: 'SKU 档案', fkColumn: 'product_code', noField: 'sku_code', linkPattern: '/master-data/product-skus?keyword=:code' },
    ...['sal_order_items','sal_store_sale_items','sal_return_items','sal_price_items','inv_batches','wms_inbound_items','wms_outbound_items'].map(refTable => ({ refTable, refDocType: '产品直接引用', fkColumn: 'product_code', noField: 'id::text', linkPattern: '/master-data/products' })),
  ],
  STORE: [
    { refTable: 'pos_sales',       refDocType: 'POS 销售',     fkColumn: 'store_code', noField: 'sale_no', linkPattern: '/store-pos?keyword=:code' },
    { refTable: 'pkg_exceptions',  refDocType: '包装异常单',   fkColumn: 'store_code', noField: 'nc_no',   linkPattern: '/packaging/exceptions?keyword=:code' },
  ],
  BANK_ACCOUNT: [
    { refTable: 'fin_cash_accounts', refDocType: 'ERP 资金账户', fkColumn: 'bank_acc_code', noField: 'account_code', linkPattern: '/master-data/cash-accounts?keyword=:code' },
  ],
  SKU: [
    // FIX UAT-1 2026-06-04: 实际表名 sal_order_items
    { refTable: 'sal_order_items', refDocType: '销售订单明细', fkColumn: 'sku_code', noField: 'id::text',     linkPattern: '/sales2/orders' },
    { refTable: 'inv_batches',     refDocType: '库存批次',     fkColumn: 'sku_code', noField: 'batch_no',     linkPattern: '/warehouse?keyword=:code' },
    { refTable: 'wms_inbound',     refDocType: '入库单',       fkColumn: 'item',     noField: 'inbound_no',   linkPattern: '/warehouse/inbound?keyword=:code' },
  ],
  WAREHOUSE: [
    { refTable: 'inv_batches',    refDocType: '库存批次', fkColumn: 'warehouse_code', noField: 'batch_no',    linkPattern: '/warehouse?keyword=:code' },
    { refTable: 'wms_inbound',    refDocType: '入库单',   fkColumn: 'warehouse_code', noField: 'inbound_no',  linkPattern: '/warehouse/inbound?keyword=:code' },
    { refTable: 'wms_outbound',   refDocType: '出库单',   fkColumn: 'warehouse_code', noField: 'outbound_no', linkPattern: '/warehouse/outbound?keyword=:code' },
    { refTable: 'wms_transfer',   refDocType: '调拨单',   fkColumn: 'from_warehouse', noField: 'transfer_no', linkPattern: '/warehouse/transfer?keyword=:code' },
  ],
  GRADE: [
    { refTable: 'product_skus', refDocType: 'SKU', fkColumn: 'grade_code', noField: 'sku_code', linkPattern: '/master-data/product-skus?keyword=:code' },
  ],
  SPEC: [
    { refTable: 'product_skus', refDocType: 'SKU', fkColumn: 'spec_code', noField: 'sku_code', linkPattern: '/master-data/product-skus?keyword=:code' },
  ],
  DRIVER: [
    { refTable: 'sal_delivery_orders', refDocType: '配送单', fkColumn: 'driver_id', noField: 'delivery_no', linkPattern: '/sales2/delivery?keyword=:code' },
  ],
  VEHICLE: [
    { refTable: 'sal_delivery_orders', refDocType: '配送单', fkColumn: 'vehicle_no', noField: 'delivery_no', linkPattern: '/sales2/delivery?keyword=:code' },
  ],
  ORGANIZATION: [
    { refTable: 'sys_organizations', refDocType: '下级组织', fkColumn: 'parent_code', noField: 'org_code', linkPattern: '/master-data/organizations?keyword=:code' },
  ],
  COMPANY: [
    { refTable: 'sys_organizations',  refDocType: '子组织',     fkColumn: 'parent_code',  noField: 'org_code',          linkPattern: '/master-data/organizations?keyword=:code' },
    { refTable: 'biz_projects',       refDocType: '项目',       fkColumn: 'company_code', noField: 'project_code',      linkPattern: '/master-data/projects?keyword=:code' },
    { refTable: 'wms_warehouses',     refDocType: '仓库',       fkColumn: 'company_code', noField: 'warehouse_code',    linkPattern: '/master-data/warehouses?keyword=:code' },
    { refTable: 'mst_stores',         refDocType: '门店',       fkColumn: 'company_code', noField: 'store_code',        linkPattern: '/master-data/stores?keyword=:code' },
    { refTable: 'fin_cash_accounts',  refDocType: '资金账户',   fkColumn: 'company_code', noField: 'account_code',      linkPattern: '/master-data/cash-accounts?keyword=:code' },
    { refTable: 'fin_bank_accounts',  refDocType: '银行账户',   fkColumn: 'company_code', noField: 'bank_account_code', linkPattern: '/master-data/bank-accounts?keyword=:code' },
  ],
};

@Injectable()
export class MasterDataReferencesService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async lockArchiveReferences(objectType: string, manager: EntityManager): Promise<void> {
    for (const table of [...new Set((REFERENCE_MAP[objectType] ?? []).map(x => x.refTable))].sort()) {
      await manager.query(`LOCK TABLE ${table} IN SHARE MODE NOWAIT`);
    }
  }

  async compute(objectType: string, objectCode: string, manager: EntityManager = this.em): Promise<ReferenceReport> {
    const normalizedType = objectType.toUpperCase();
    const mappings = REFERENCE_MAP[normalizedType] ?? [];
    // Product/material safety checks fail closed; keep unrelated historical display behavior unchanged.
    const query = <T>(sql: string, params: any[]) => ['MATERIAL','PRODUCT'].includes(normalizedType)
      ? manager.query(sql, params) as Promise<T[]> : this.safe<T>(sql, params);
    const references: ReferenceItem[] = [];
    let total = 0;
    let referenceValue = objectCode;
    if (normalizedType === 'DRIVER') {
      const drivers = await this.safe<{ id: string }>('SELECT id::text AS id FROM sal_drivers WHERE driver_code = $1 LIMIT 1', [objectCode]);
      referenceValue = drivers[0]?.id ?? '__NO_DRIVER__';
    }

    for (const m of mappings) {
      const predicate = m.predicate ?? `${m.fkColumn} = $1`;
      const cntRows = await query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${m.refTable} WHERE (${predicate})`,
        [referenceValue],
      );
      const count = parseInt(cntRows[0]?.c ?? '0', 10);
      if (count > 0) {
        const exRows = await query<{ no: string }>(
          `SELECT ${m.noField} AS no FROM ${m.refTable} WHERE (${predicate}) ORDER BY created_at DESC NULLS LAST LIMIT 5`,
          [referenceValue],
        );
        references.push({
          refTable: m.refTable,
          refDocType: m.refDocType,
          refCount: count,
          example: exRows.map(r => r.no).filter(Boolean),
          linkPattern: m.linkPattern.replace(':code', encodeURIComponent(objectCode)),
        });
        total += count;
      }
    }

    return {
      objectType: objectType.toUpperCase(),
      objectCode,
      totalReferences: total,
      references,
      isReferenced: total > 0,
      canArchive: total === 0,
      asOf: new Date().toISOString(),
    };
  }
}
