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
  noField: string;     // 业务单号字段
  linkPattern: string; // 前端跳转 URL 模式
}>> = {
  CUSTOMER: [
    { refTable: 'sales_orders',    refDocType: '销售订单', fkColumn: 'customer_code', noField: 'so_no',       linkPattern: '/sales2/orders?keyword=:code' },
    { refTable: 'fin_ar_invoices', refDocType: 'AR 发票',  fkColumn: 'customer_code', noField: 'ar_no',       linkPattern: '/finance2/ar?keyword=:code' },
    { refTable: 'fin_ar_receipts', refDocType: '收款单',   fkColumn: 'customer_code', noField: 'receipt_no',  linkPattern: '/finance2/ar?keyword=:code' },
    { refTable: 'wms_outbound',    refDocType: '出库单',   fkColumn: 'dest',          noField: 'outbound_no', linkPattern: '/warehouse/outbound?keyword=:code' },
  ],
  SUPPLIER: [
    { refTable: 'prc_orders',      refDocType: '采购订单', fkColumn: 'supplier_code', noField: 'po_no',       linkPattern: '/procurement2/orders?keyword=:code' },
    { refTable: 'fin_ap_invoices', refDocType: 'AP 发票',  fkColumn: 'supplier_code', noField: 'ap_no',       linkPattern: '/finance2/ap?keyword=:code' },
    { refTable: 'prc_payments',    refDocType: '采购付款单', fkColumn: 'payee_name',  noField: 'pay_no',      linkPattern: '/procurement2/payments?keyword=:code' },
  ],
  PROJECT: [
    { refTable: 'sales_orders',         refDocType: '销售订单', fkColumn: 'project_code', noField: 'so_no',        linkPattern: '/sales2/orders?keyword=:code' },
    { refTable: 'prc_orders',           refDocType: '采购订单', fkColumn: 'project_code', noField: 'po_no',        linkPattern: '/procurement2/orders?keyword=:code' },
    { refTable: 'shr_contributions',    refDocType: '股东出资', fkColumn: 'project_code', noField: 'contribution_no', linkPattern: '/finance2/shareholder-funds?keyword=:code' },
  ],
  CASH_ACCOUNT: [
    { refTable: 'fin_cash_transactions', refDocType: '资金流水', fkColumn: 'account_id', noField: 'txn_no', linkPattern: '/finance2/fund-transfers?keyword=:code' },
    { refTable: 'fin_fund_transfers',    refDocType: '资金调拨', fkColumn: 'from_account_id', noField: 'transfer_no', linkPattern: '/finance2/fund-transfers?keyword=:code' },
    { refTable: 'fin_reimbursements',    refDocType: '报销付款', fkColumn: 'cash_account_id', noField: 'reimb_no', linkPattern: '/finance2/reimbursements?keyword=:code' },
  ],
  PRODUCT: [
    { refTable: 'product_skus', refDocType: 'SKU 档案', fkColumn: 'product_code', noField: 'sku_code', linkPattern: '/master-data/product-skus?keyword=:code' },
  ],
  STORE: [
    { refTable: 'pos_sales',       refDocType: 'POS 销售',     fkColumn: 'store_code', noField: 'sale_no', linkPattern: '/store-pos?keyword=:code' },
    { refTable: 'pkg_exceptions',  refDocType: '包装异常单',   fkColumn: 'store_code', noField: 'nc_no',   linkPattern: '/packaging/exceptions?keyword=:code' },
  ],
  BANK_ACCOUNT: [
    { refTable: 'fin_cash_accounts', refDocType: 'ERP 资金账户', fkColumn: 'bank_acc_code', noField: 'account_code', linkPattern: '/master-data/cash-accounts?keyword=:code' },
  ],
  SKU: [
    { refTable: 'sales_order_items',     refDocType: '销售订单明细', fkColumn: 'sku_code', noField: 'item_id::text',  linkPattern: '/sales2/orders' },
    { refTable: 'inv_batches',           refDocType: '库存批次',     fkColumn: 'sku_code', noField: 'batch_no',       linkPattern: '/warehouse?keyword=:code' },
    { refTable: 'wms_inbound',           refDocType: '入库单',       fkColumn: 'item',     noField: 'inbound_no',     linkPattern: '/warehouse/inbound?keyword=:code' },
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
    { refTable: 'sal_delivery_orders', refDocType: '配送单', fkColumn: 'driver_name', noField: 'delivery_no', linkPattern: '/sales2/delivery?keyword=:code' },
  ],
  VEHICLE: [
    { refTable: 'sal_delivery_orders', refDocType: '配送单', fkColumn: 'vehicle_no', noField: 'delivery_no', linkPattern: '/sales2/delivery?keyword=:code' },
  ],
};

@Injectable()
export class MasterDataReferencesService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch { return []; }
  }

  async compute(objectType: string, objectCode: string): Promise<ReferenceReport> {
    const mappings = REFERENCE_MAP[objectType.toUpperCase()] ?? [];
    const references: ReferenceItem[] = [];
    let total = 0;

    for (const m of mappings) {
      const cntRows = await this.safe<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ${m.refTable} WHERE ${m.fkColumn} = $1`,
        [objectCode],
      );
      const count = parseInt(cntRows[0]?.c ?? '0', 10);
      if (count > 0) {
        const exRows = await this.safe<{ no: string }>(
          `SELECT ${m.noField} AS no FROM ${m.refTable} WHERE ${m.fkColumn} = $1 ORDER BY created_at DESC NULLS LAST LIMIT 5`,
          [objectCode],
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
