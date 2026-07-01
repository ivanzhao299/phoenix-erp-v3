import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

import { Prc2InitBatchEntity }         from '../entities/prc2-init-batch.entity';
import { Prc2InitBatchRowEntity }       from '../entities/prc2-init-batch-row.entity';
import { Prc2PurchaseOrderEntity }      from '../entities/prc2-purchase-order.entity';
import { Prc2OrderItemEntity }          from '../entities/prc2-order-item.entity';
import { Prc2ApLedgerEntity }           from '../entities/prc2-ap-ledger.entity';
import { Prc2PaymentEntity }            from '../entities/prc2-payment.entity';
import { Prc2PaymentAllocationEntity }  from '../entities/prc2-payment-allocation.entity';
import { Prc2ShareholderFundEntity }    from '../entities/prc2-shareholder-fund.entity';
import { Prc2ReceiptEntity }            from '../entities/prc2-receipt.entity';
import { Prc2ReceiptItemEntity }        from '../entities/prc2-receipt-item.entity';

import { QueryInitBatchDto }            from '../dto/query-init-batch.dto';
import { INIT_BATCH_TYPES, InitBatchType } from '../dto/upload-init-file.dto';
import { DataScopeContext } from '../../org/services/data-scope.service';

// ── 并发安全编号生成 ─────────────────────────────────────────────────────────
async function genNo(
  mgr: EntityManager,
  prefix: string,
  entity: new () => object,
  alias: string,
  field: string,
): Promise<string> {
  await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const row = await mgr.createQueryBuilder(entity as never, alias)
    .select(`MAX(${alias}.${field})`, 'max')
    .where(`${alias}.${field} LIKE :p`, { p: `${prefix}%` })
    .getRawOne<{ max: string | null }>();
  let seq = 1;
  if (row?.max) {
    const last = parseInt(row.max.slice(prefix.length), 10);
    if (!isNaN(last)) seq = last + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ── AP 状态计算 ───────────────────────────────────────────────────────────────
function calcApStatus(amountOriginal: number, paidAmount: number): string {
  if (paidAmount <= 0) return 'OPEN';
  if (paidAmount >= amountOriginal) return 'PAID';
  return 'PARTIAL';
}

// ── Excel 模板定义 ────────────────────────────────────────────────────────────
const TEMPLATES: Record<InitBatchType, { headers: string[]; example: (string | number)[] }> = {
  HISTORICAL_PO: {
    headers: [
      'po_no', 'supplier_name*', 'subject*', 'total_amount*', 'currency_code*',
      'status*', 'company_code', 'project_code', 'cross_border_flag',
      'item_name*', 'item_qty*', 'item_unit', 'item_unit_price', 'item_amount',
      'warehouse_code', 'remark',
    ],
    example: [
      'PO2-20240101-00001', '示例供应商', '农场设备采购', 50000, 'CNY',
      'RECEIVED', 'ALL', '', 'false',
      '拖拉机', 1, '台', 50000, 50000,
      'WH001', '历史数据导入',
    ],
  },
  HISTORICAL_PAYMENT: {
    headers: [
      'pay_no', 'po_no', 'ap_no', 'payment_date*', 'currency_code*',
      'amount_original*', 'exchange_rate', 'payer_type*', 'payer_name',
      'payment_method', 'fund_nature', 'is_shareholder_payment',
      'shareholder_name', 'voucher_url', 'status*', 'remark',
    ],
    example: [
      'PAY2-20240101-00001', 'PO2-20240101-00001', '', '2024-01-15', 'CNY',
      50000, 1460, 'COMPANY', '公司付款',
      'BANK_TRANSFER', '', 'false',
      '', '', 'EXECUTED', '历史付款导入',
    ],
  },
  HISTORICAL_SHAREHOLDER_FUND: {
    headers: [
      'fund_no', 'occurred_date*', 'shareholder_name*', 'company_code',
      'project_code', 'source_type*', 'fund_nature*', 'currency_code*',
      'amount_original*', 'exchange_rate', 'related_po_no', 'remark',
    ],
    example: [
      'SF2-20240101-00001', '2024-01-01', '张三', 'ALL',
      '', 'ADVANCE', 'ADVANCE', 'CNY',
      100000, 1460, '', '股东出资历史记录',
    ],
  },
  HISTORICAL_RECEIPT: {
    headers: [
      'receipt_no', 'po_no*', 'receipt_date*', 'warehouse_code',
      'receiver_name', 'item_name*', 'expected_qty*', 'actual_qty*',
      'rejected_qty', 'unit', 'quality_status', 'remark',
    ],
    example: [
      'RCV2-20240101-00001', 'PO2-20240101-00001', '2024-01-20', 'WH001',
      '张收货员', '拖拉机', 1, 1,
      0, '台', 'PASS', '历史收货导入',
    ],
  },
};

// ── 行字段验证 ────────────────────────────────────────────────────────────────
function validateRow(batchType: InitBatchType, row: Record<string, unknown>, rowNo: number): string[] {
  const errors: string[] = [];
  const req = (field: string) => {
    const v = row[field];
    if (v === undefined || v === null || String(v).trim() === '')
      errors.push(`第${rowNo}行: ${field} 为必填项`);
  };
  const num = (field: string) => {
    const v = row[field];
    if (v !== undefined && v !== null && v !== '' && isNaN(Number(v)))
      errors.push(`第${rowNo}行: ${field} 必须为数字`);
  };

  if (batchType === 'HISTORICAL_PO') {
    req('supplier_name*'); req('subject*'); req('total_amount*');
    req('currency_code*'); req('status*');
    req('item_name*'); req('item_qty*');
    num('total_amount*'); num('item_qty*'); num('item_unit_price'); num('item_amount');
  } else if (batchType === 'HISTORICAL_PAYMENT') {
    req('payment_date*'); req('currency_code*');
    req('amount_original*'); req('payer_type*'); req('status*');
    num('amount_original*'); num('exchange_rate');
  } else if (batchType === 'HISTORICAL_SHAREHOLDER_FUND') {
    req('occurred_date*'); req('shareholder_name*'); req('source_type*');
    req('fund_nature*'); req('currency_code*'); req('amount_original*');
    num('amount_original*'); num('exchange_rate');
  } else if (batchType === 'HISTORICAL_RECEIPT') {
    req('po_no*'); req('receipt_date*');
    req('item_name*'); req('expected_qty*'); req('actual_qty*');
    num('expected_qty*'); num('actual_qty*'); num('rejected_qty');
  }

  return errors;
}

@Injectable()
export class InitService {
  constructor(
    @InjectRepository(Prc2InitBatchEntity)    private batchRepo: Repository<Prc2InitBatchEntity>,
    @InjectRepository(Prc2InitBatchRowEntity) private rowRepo:   Repository<Prc2InitBatchRowEntity>,
    @InjectDataSource() private ds: DataSource,
    private cls: ClsService,
  ) {}

  private userId(): string {
    const u = this.cls.get('user');
    return String(u?.userId ?? u?.id ?? 0);
  }
  private userName(): string {
    const u = this.cls.get('user');
    return u?.name ?? u?.username ?? 'system';
  }

  private dataScope(): DataScopeContext | undefined {
    return this.cls.get<DataScopeContext | undefined>('dataScope');
  }

  private isGlobalScope(): boolean {
    const scope = this.dataScope();
    return !scope || scope.isGlobal;
  }

  /**
   * prc2_init_batches is an import-control table without company/project columns.
   * Until a schema-gated scoped owner field is added, non-global users may only
   * read or mutate their own import batches; GROUP/admin users keep full audit view.
   */
  private applyBatchReadScope(qb: SelectQueryBuilder<Prc2InitBatchEntity>) {
    if (this.isGlobalScope()) return qb;
    return qb.andWhere('b.createdBy = :initBatchUserId', { initBatchUserId: this.userId() });
  }

  private assertBatchAccess(batch: Prc2InitBatchEntity, label: string) {
    if (this.isGlobalScope()) return;
    if (String(batch.createdBy ?? '') !== this.userId()) {
      throw new ForbiddenException(`无权访问该${label}`);
    }
  }

  // ── 模板下载 ────────────────────────────────────────────────────────────────
  downloadTemplate(batchType: string): Buffer {
    // 支持 slug（historical-po）和枚举值（HISTORICAL_PO）两种形式
    const SLUG_MAP: Record<string, InitBatchType> = {
      'historical-po':               'HISTORICAL_PO',
      'historical-payment':          'HISTORICAL_PAYMENT',
      'historical-shareholder-fund': 'HISTORICAL_SHAREHOLDER_FUND',
      'historical-receipt':          'HISTORICAL_RECEIPT',
    };
    const resolved = SLUG_MAP[batchType] ?? batchType;
    if (!INIT_BATCH_TYPES.includes(resolved as InitBatchType))
      throw new BadRequestException(`不支持的 batchType: ${batchType}`);
    const batchType2 = resolved as InitBatchType;

    const tpl = TEMPLATES[batchType2];
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.aoa_to_sheet([tpl.headers, tpl.example]);
    ws['!cols'] = tpl.headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ── 批次列表 ────────────────────────────────────────────────────────────────
  async list(q: QueryInitBatchDto) {
    const page     = Math.max(1, parseInt(q.page     ?? '1',  10));
    const pageSize = Math.max(1, parseInt(q.pageSize ?? '20', 10));

    const qb = this.applyBatchReadScope(
      this.batchRepo.createQueryBuilder('b').orderBy('b.id', 'DESC'),
    );
    if (q.batchType) qb.andWhere('b.batchType = :bt', { bt: q.batchType });
    if (q.status)    qb.andWhere('b.status = :s',     { s:  q.status    });
    if (q.keyword)   qb.andWhere(
      '(b.batchNo ILIKE :kw OR b.fileName ILIKE :kw OR b.createdByName ILIKE :kw)',
      { kw: `%${q.keyword}%` },
    );

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, pageSize };
  }

  // ── 批次详情 ────────────────────────────────────────────────────────────────
  async findById(id: string) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`批次 ID=${id} 不存在`);
    this.assertBatchAccess(batch, '初始化批次');
    const rows = await this.rowRepo.find({ where: { batchId: id }, order: { rowNo: 'ASC' } });
    return { ...batch, rows };
  }

  // ── 错误行 ──────────────────────────────────────────────────────────────────
  async getErrorRows(id: string) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`批次 ID=${id} 不存在`);
    this.assertBatchAccess(batch, '初始化批次');
    return this.rowRepo.find({
      where: [
        { batchId: id, status: 'INVALID' },
        { batchId: id, status: 'FAILED'  },
      ],
      order: { rowNo: 'ASC' },
    });
  }

  // ── 取消批次 ────────────────────────────────────────────────────────────────
  async cancelBatch(id: string) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`批次 ID=${id} 不存在`);
    this.assertBatchAccess(batch, '初始化批次');
    if (!['DRAFT', 'VALIDATED', 'FAILED'].includes(batch.status))
      throw new ConflictException(`当前状态 ${batch.status} 不允许取消`);
    batch.status = 'CANCELLED';
    return this.batchRepo.save(batch);
  }

  // ── 上传 + 校验（不写业务表）───────────────────────────────────────────────
  async validateFile(batchType: string, buffer: Buffer, fileName: string, remark?: string) {
    if (!INIT_BATCH_TYPES.includes(batchType as InitBatchType))
      throw new BadRequestException(`不支持的 batchType: ${batchType}`);

    const wb      = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const ws      = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    if (rawRows.length === 0)
      throw new BadRequestException('文件为空，请填写数据后重新上传');

    return this.ds.transaction(async mgr => {
      const prefix  = `BATCH-${format(new Date(), 'yyyyMMdd')}-`;
      const batchNo = await genNo(mgr, prefix, Prc2InitBatchEntity, 'b', 'batchNo');

      const batch = await mgr.save(Prc2InitBatchEntity, mgr.create(Prc2InitBatchEntity, {
        batchNo, batchType, fileName,
        status: 'DRAFT', totalRows: rawRows.length,
        successRows: 0, failedRows: 0,
        createdBy: this.userId(), createdByName: this.userName(),
        remark,
      }));

      let validCount = 0, invalidCount = 0;

      for (let i = 0; i < rawRows.length; i++) {
        const row    = rawRows[i];
        const rowNo  = i + 2;
        const errors = validateRow(batchType as InitBatchType, row, rowNo);
        const ok     = errors.length === 0;
        if (ok) validCount++; else invalidCount++;

        await mgr.save(Prc2InitBatchRowEntity, mgr.create(Prc2InitBatchRowEntity, {
          batchId:      batch.id,
          rowNo,
          rawData:      row,
          status:       ok ? 'VALID' : 'INVALID',
          errorMessage: errors.join('; ') || undefined,
        }));
      }

      batch.status      = 'VALIDATED';
      batch.successRows = validCount;
      batch.failedRows  = invalidCount;
      await mgr.save(Prc2InitBatchEntity, batch);

      return {
        batchId: batch.id, batchNo: batch.batchNo,
        totalRows: rawRows.length, validRows: validCount,
        invalidRows: invalidCount, status: batch.status,
      };
    });
  }

  // ── 执行导入 ────────────────────────────────────────────────────────────────
  async importBatch(id: string) {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`批次 ID=${id} 不存在`);
    this.assertBatchAccess(batch, '初始化批次');

    if (batch.status === 'IMPORTED')
      throw new ConflictException('该批次已导入完成，不允许重复导入');
    if (!['VALIDATED', 'FAILED'].includes(batch.status))
      throw new ConflictException(`当前状态 ${batch.status} 不允许导入，请先上传并验证文件`);

    const rows = await this.rowRepo.find({ where: { batchId: id }, order: { rowNo: 'ASC' } });

    let successRows = 0, failedRows = 0;

    for (const row of rows) {
      if (row.status === 'INVALID')  { failedRows++;  continue; }
      if (row.status === 'IMPORTED') { successRows++; continue; }
      if (row.status === 'SKIPPED')  { successRows++; continue; }

      try {
        await this.importRow(batch.batchType as InitBatchType, row);
        successRows++;
      } catch (e) {
        failedRows++;
        row.status       = 'FAILED';
        row.errorMessage = e instanceof Error ? e.message : String(e);
        await this.rowRepo.save(row);
      }
    }

    batch.successRows = successRows;
    batch.failedRows  = failedRows;
    batch.status      = failedRows > 0 ? 'FAILED' : 'IMPORTED';
    await this.batchRepo.save(batch);

    return {
      batchId: batch.id, batchNo: batch.batchNo,
      totalRows: batch.totalRows, successRows, failedRows,
      status: batch.status,
    };
  }

  private async importRow(batchType: InitBatchType, rowEntity: Prc2InitBatchRowEntity) {
    const row = rowEntity.rawData;
    if      (batchType === 'HISTORICAL_PO')               await this.importPo(rowEntity, row);
    else if (batchType === 'HISTORICAL_PAYMENT')           await this.importPayment(rowEntity, row);
    else if (batchType === 'HISTORICAL_SHAREHOLDER_FUND')  await this.importFund(rowEntity, row);
    else if (batchType === 'HISTORICAL_RECEIPT')           await this.importReceipt(rowEntity, row);
  }

  // ── HISTORICAL_PO ─────────────────────────────────────────────────────────
  private async importPo(rowEntity: Prc2InitBatchRowEntity, row: Record<string, unknown>) {
    await this.ds.transaction(async mgr => {
      const today = format(new Date(), 'yyyyMMdd');

      // 编号：有填则用，否则自动生成
      let poNo = String(row['po_no'] ?? '').trim();
      if (!poNo) poNo = await genNo(mgr, `INIT-PO2-${today}-`, Prc2PurchaseOrderEntity, 'p', 'poNo');

      const existing = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { poNo } });
      if (existing) {
        Object.assign(rowEntity, { status: 'SKIPPED', relatedPoId: existing.id, relatedPoNo: existing.poNo, errorMessage: `po_no=${poNo} 已存在，跳过` });
        return mgr.save(Prc2InitBatchRowEntity, rowEntity);
      }

      const totalAmount  = Number(row['total_amount*'] ?? 0);
      const currencyCode = String(row['currency_code*'] ?? 'LAK');
      const status       = String(row['status*'] ?? 'RECEIVED');
      const itemQty      = Number(row['item_qty*'] ?? 0);
      const validStatuses = ['APPROVED','PARTIALLY_PAID','PAID','PARTIALLY_RECEIVED','RECEIVED','CLOSED'];

      const po = await mgr.save(Prc2PurchaseOrderEntity, mgr.create(Prc2PurchaseOrderEntity, {
        poNo,
        purchaseType:  'INIT',
        supplierName:  String(row['supplier_name*'] ?? ''),
        supplierCode:  '',
        subject:       String(row['subject*']        ?? ''),
        totalAmount,
        currencyCode,
        companyCode:   String(row['company_code'] ?? 'ALL') || 'ALL',
        projectCode:   String(row['project_code'] ?? '') || undefined,
        crossBorderFlag: String(row['cross_border_flag'] ?? '').toLowerCase() === 'true',
        status:        validStatuses.includes(status) ? status : 'RECEIVED',
        approvalStatus: 'APPROVED',
        planQty:       itemQty,
        receivedQty:   0,
        paidAmount:    0,
        remark:        String(row['remark'] ?? '') || undefined,
        createdBy:     this.userId(),
      }));

      // 明细行
      const unitPrice = Number(row['item_unit_price'] ?? 0);
      await mgr.save(Prc2OrderItemEntity, mgr.create(Prc2OrderItemEntity, {
        poId:        po.id,
        poNo:        po.poNo,
        itemName:    String(row['item_name*'] ?? ''),
        qty:         itemQty,
        unit:        String(row['item_unit']   ?? '') || undefined,
        unitPrice,
        amount:      Number(row['item_amount'] ?? 0) || itemQty * unitPrice,
        receivedQty: 0,
      }));

      // 自动生成 AP（凡是已审批状态都生成）
      const apNo = await genNo(mgr, `AP2-${today}-`, Prc2ApLedgerEntity, 'ap', 'apNo');
      await mgr.save(Prc2ApLedgerEntity, mgr.create(Prc2ApLedgerEntity, {
        apNo,
        poId:                  po.id,
        supplierName:          po.supplierName,
        amountOriginal:        totalAmount,
        currencyCode,
        paidAmountOriginal:    0,
        balanceAmountOriginal: totalAmount,
        status:               'OPEN',
        companyCode:           po.companyCode ?? 'ALL',
        createdBy:             this.userId(),
      }));

      Object.assign(rowEntity, { status: 'IMPORTED', relatedPoId: po.id, relatedPoNo: po.poNo });
      await mgr.save(Prc2InitBatchRowEntity, rowEntity);
    });
  }

  // ── HISTORICAL_PAYMENT ────────────────────────────────────────────────────
  private async importPayment(rowEntity: Prc2InitBatchRowEntity, row: Record<string, unknown>) {
    await this.ds.transaction(async mgr => {
      const today = format(new Date(), 'yyyyMMdd');

      let payNo = String(row['pay_no'] ?? '').trim();
      if (!payNo) payNo = await genNo(mgr, `INIT-PAY2-${today}-`, Prc2PaymentEntity, 'p', 'payNo');

      const existing = await mgr.findOne(Prc2PaymentEntity, { where: { payNo } });
      if (existing) {
        Object.assign(rowEntity, { status: 'SKIPPED', relatedPaymentId: existing.id, relatedPayNo: existing.payNo, errorMessage: `pay_no=${payNo} 已存在，跳过` });
        return mgr.save(Prc2InitBatchRowEntity, rowEntity);
      }

      const amountOriginal   = Number(row['amount_original*'] ?? 0);
      const currencyCode     = String(row['currency_code*']   ?? 'LAK');
      const exchangeRate     = Number(row['exchange_rate']     ?? 1) || 1;
      const payerType        = String(row['payer_type*']       ?? 'COMPANY');
      const isShareholderPmt = String(row['is_shareholder_payment'] ?? '').toLowerCase() === 'true'
                                || payerType === 'SHAREHOLDER';
      const status           = String(row['status*'] ?? 'EXECUTED');
      const validStatuses    = ['DRAFT','PENDING_APPROVAL','APPROVED','EXECUTED','VOID'];

      const payment = await mgr.save(Prc2PaymentEntity, mgr.create(Prc2PaymentEntity, {
        payNo,
        paymentDate:         String(row['payment_date*'] ?? format(new Date(), 'yyyy-MM-dd')),
        payerType,
        payerName:           String(row['payer_name']    ?? (payerType === 'COMPANY' ? '公司付款' : '')),
        currencyCode,
        amountOriginal,
        exchangeRate,
        amountBase:          amountOriginal * exchangeRate,
        baseCurrency:        'CNY',
        paymentMethod:       String(row['payment_method'] ?? 'BANK_TRANSFER') || 'BANK_TRANSFER',
        fundNature:          String(row['fund_nature']    ?? '') || undefined,
        isShareholderPayment: isShareholderPmt,
        shareholderName:     isShareholderPmt ? String(row['shareholder_name'] ?? '') : undefined,
        voucherUrl:          String(row['voucher_url'] ?? '') || undefined,
        status:              validStatuses.includes(status) ? status : 'EXECUTED',
        remark:              String(row['remark'] ?? '') || undefined,
        createdBy:           this.userId(),
      }));

      // 尝试按 po_no 或 ap_no 匹配 AP，核销
      const poNo = String(row['po_no'] ?? '').trim();
      const apNo = String(row['ap_no'] ?? '').trim();

      let ap: Prc2ApLedgerEntity | null = null;
      if (apNo) {
        ap = await mgr.findOne(Prc2ApLedgerEntity, { where: { apNo } });
      }
      if (!ap && poNo) {
        const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { poNo } });
        if (po) {
          ap = await mgr.findOne(Prc2ApLedgerEntity, { where: { poId: po.id } });

          // 创建分摊记录
          await mgr.save(Prc2PaymentAllocationEntity, mgr.create(Prc2PaymentAllocationEntity, {
            paymentId:               payment.id,
            poId:                    po.id,
            poNo:                    po.poNo,
            allocatedAmountOriginal: amountOriginal,
            allocatedAmountBase:     amountOriginal * exchangeRate,
          }));

          // 更新 PO paid_amount
          if (status === 'EXECUTED') {
            po.paidAmount = Number(po.paidAmount) + amountOriginal;
            await mgr.save(Prc2PurchaseOrderEntity, po);
          }
        }
      }

      // 核销 AP
      if (ap && status === 'EXECUTED') {
        ap.paidAmountOriginal    = Number(ap.paidAmountOriginal)    + amountOriginal;
        ap.balanceAmountOriginal = Number(ap.amountOriginal) - Number(ap.paidAmountOriginal);
        ap.status = calcApStatus(Number(ap.amountOriginal), Number(ap.paidAmountOriginal));
        await mgr.save(Prc2ApLedgerEntity, ap);
      }

      // 股东代付 → 自动生成 shareholder_fund 记录
      if (isShareholderPmt) {
        const sfNo = await genNo(mgr, `INIT-SF2-${today}-`, Prc2ShareholderFundEntity, 'f', 'fundNo');
        await mgr.save(Prc2ShareholderFundEntity, mgr.create(Prc2ShareholderFundEntity, {
          fundNo:          sfNo,
          shareholderName: String(row['shareholder_name'] ?? '未知股东'),
          fundNature:      String(row['fund_nature'] ?? 'ADVANCE') || 'ADVANCE',
          sourceType:      'PAYMENT',
          currencyCode,
          amountOriginal,
          exchangeRate,
          amountBase:      amountOriginal * exchangeRate,
          baseCurrency:    'CNY',
          relatedPaymentId: payment.id,
          occurredDate:    String(row['payment_date*'] ?? format(new Date(), 'yyyy-MM-dd')),
          status:          'CONFIRMED',
          remark:          `由历史付款 ${payNo} 自动生成`,
          createdBy:       this.userId(),
        }));
      }

      Object.assign(rowEntity, { status: 'IMPORTED', relatedPaymentId: payment.id, relatedPayNo: payment.payNo });
      await mgr.save(Prc2InitBatchRowEntity, rowEntity);
    });
  }

  // ── HISTORICAL_SHAREHOLDER_FUND ───────────────────────────────────────────
  private async importFund(rowEntity: Prc2InitBatchRowEntity, row: Record<string, unknown>) {
    await this.ds.transaction(async mgr => {
      const today = format(new Date(), 'yyyyMMdd');

      let fundNo = String(row['fund_no'] ?? '').trim();
      if (!fundNo) fundNo = await genNo(mgr, `INIT-SF2-${today}-`, Prc2ShareholderFundEntity, 'f', 'fundNo');

      const existing = await mgr.findOne(Prc2ShareholderFundEntity, { where: { fundNo } });
      if (existing) {
        Object.assign(rowEntity, { status: 'SKIPPED', relatedFundId: existing.id, relatedFundNo: existing.fundNo, errorMessage: `fund_no=${fundNo} 已存在，跳过` });
        return mgr.save(Prc2InitBatchRowEntity, rowEntity);
      }

      const amountOriginal = Number(row['amount_original*'] ?? 0);
      const currencyCode   = String(row['currency_code*']   ?? 'CNY');
      const exchangeRate   = Number(row['exchange_rate']     ?? 1) || 1;
      const sourceType     = String(row['source_type*']      ?? 'ADVANCE');
      const fundNature     = String(row['fund_nature*']      ?? 'ADVANCE');

      const validSourceTypes = ['INIT','PAYMENT','DIVIDEND_OFFSET','DIRECT_INVESTMENT','LOAN','ADVANCE'];
      const validFundNatures = ['INVESTMENT','LOAN','ADVANCE'];

      // 查找关联 PO
      const relatedPoNo = String(row['related_po_no'] ?? '').trim();
      const relatedPo   = relatedPoNo
        ? await mgr.findOne(Prc2PurchaseOrderEntity, { where: { poNo: relatedPoNo } })
        : null;

      const fund = await mgr.save(Prc2ShareholderFundEntity, mgr.create(Prc2ShareholderFundEntity, {
        fundNo,
        shareholderName: String(row['shareholder_name*'] ?? ''),
        fundNature:      validFundNatures.includes(fundNature) ? fundNature : 'ADVANCE',
        sourceType:      validSourceTypes.includes(sourceType) ? sourceType : 'ADVANCE',
        currencyCode,
        amountOriginal,
        exchangeRate,
        amountBase:      amountOriginal * exchangeRate,
        baseCurrency:    'CNY',
        companyCode:     String(row['company_code'] ?? 'ALL') || 'ALL',
        projectCode:     String(row['project_code'] ?? '') || undefined,
        relatedPoId:     relatedPo?.id,
        relatedPoNo:     relatedPo?.poNo,
        occurredDate:    String(row['occurred_date*'] ?? format(new Date(), 'yyyy-MM-dd')),
        status:          'CONFIRMED',
        remark:          String(row['remark'] ?? '') || undefined,
        createdBy:       this.userId(),
      }));

      Object.assign(rowEntity, { status: 'IMPORTED', relatedFundId: fund.id, relatedFundNo: fund.fundNo });
      await mgr.save(Prc2InitBatchRowEntity, rowEntity);
    });
  }

  // ── HISTORICAL_RECEIPT ────────────────────────────────────────────────────
  private async importReceipt(rowEntity: Prc2InitBatchRowEntity, row: Record<string, unknown>) {
    await this.ds.transaction(async mgr => {
      const today = format(new Date(), 'yyyyMMdd');
      const poNo  = String(row['po_no*'] ?? '').trim();

      let receiptNo = String(row['receipt_no'] ?? '').trim();
      if (!receiptNo) receiptNo = await genNo(mgr, `INIT-RCV2-${today}-`, Prc2ReceiptEntity, 'r', 'receiptNo');

      const existing = await mgr.findOne(Prc2ReceiptEntity, { where: { receiptNo } });
      if (existing) {
        Object.assign(rowEntity, { status: 'SKIPPED', relatedReceiptId: existing.id, relatedReceiptNo: existing.receiptNo, errorMessage: `receipt_no=${receiptNo} 已存在，跳过` });
        return mgr.save(Prc2InitBatchRowEntity, rowEntity);
      }

      const po = await mgr.findOne(Prc2PurchaseOrderEntity, { where: { poNo } });
      if (!po) throw new Error(`采购订单 po_no=${poNo} 不存在，请先导入历史PO`);

      const actualQty   = Number(row['actual_qty*']   ?? 0);
      const expectedQty = Number(row['expected_qty*'] ?? actualQty);
      const rejectedQty = Number(row['rejected_qty']  ?? 0);

      // 超收检查
      const allowable = Number(po.planQty) - Number(po.receivedQty);
      if (actualQty > allowable + 0.0001)
        throw new Error(`超收：PO 可收 ${allowable}，本次收 ${actualQty}`);

      const receipt = await mgr.save(Prc2ReceiptEntity, mgr.create(Prc2ReceiptEntity, {
        receiptNo,
        poId:          po.id,
        poNo:          po.poNo,
        receiptDate:   String(row['receipt_date*'] ?? format(new Date(), 'yyyy-MM-dd')),
        warehouseCode: String(row['warehouse_code']  ?? '') || undefined,
        receiverName:  String(row['receiver_name']   ?? '') || undefined,
        status:        'CONFIRMED',
        confirmedBy:   this.userId(),
        confirmedAt:   new Date(),
        remark:        String(row['remark'] ?? '') || undefined,
        createdBy:     this.userId(),
      }));

      const qualityStatus = String(row['quality_status'] ?? 'PASS');
      await mgr.save(Prc2ReceiptItemEntity, mgr.create(Prc2ReceiptItemEntity, {
        receiptId:     receipt.id,
        itemName:      String(row['item_name*'] ?? ''),
        expectedQty,
        actualQty,
        rejectedQty,
        unit:          String(row['unit'] ?? '') || undefined,
        qualityStatus: ['PASS','PARTIAL','REJECT'].includes(qualityStatus) ? qualityStatus : 'PASS',
        remark:        String(row['remark'] ?? '') || undefined,
      }));

      // 更新 PO received_qty 和状态
      po.receivedQty = Number(po.receivedQty) + actualQty;
      const fullReceived = Number(po.receivedQty) >= Number(po.planQty) - 0.0001;
      if (fullReceived && po.status === 'PARTIALLY_RECEIVED') po.status = 'RECEIVED';
      else if (!fullReceived && po.status === 'APPROVED')     po.status = 'PARTIALLY_RECEIVED';
      await mgr.save(Prc2PurchaseOrderEntity, po);

      Object.assign(rowEntity, { status: 'IMPORTED', relatedReceiptId: receipt.id, relatedReceiptNo: receipt.receiptNo });
      await mgr.save(Prc2InitBatchRowEntity, rowEntity);
    });
  }
}
