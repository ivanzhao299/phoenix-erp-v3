import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import {
  CreateCustomerDto, UpdateCustomerDto, QueryCustomerDto,
  FreezeCustomerDto, BlacklistCustomerDto, UpdateCreditLimitDto,
} from '../dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId: String(u?.userId ?? u?.id ?? '0'),
      roles: (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: (u?.companyCodes ?? []) as string[],
      scopeAll: !!(u?.scopeAll),
    };
  }

  private async assertOwnership(id: string): Promise<any> {
    const row = await this.ds.query(
      `SELECT id, customer_no, customer_name, company_code, status, credit_limit, credit_used
       FROM sal_customers WHERE id = $1`,
      [id],
    );
    if (!row?.length) throw new NotFoundException(`客户 ${id} 不存在`);
    const rec = row[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(rec.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的客户数据`);
    }
    return rec;
  }

  private async genCustomerNo(companyCode: string): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CUS-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_customers WHERE customer_no LIKE $1`,
      [`${prefix}%`],
    );
    const seq = String(Number(row[0].cnt) + 1).padStart(5, '0');
    return `${prefix}${seq}`;
  }

  async list(q: QueryCustomerDto) {
    const user = this.currentUser();
    const page  = Math.max(1, q.page  ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      where.push(`company_code = ANY($${params.length})`);
    }
    if (q.companyCode) {
      params.push(q.companyCode);
      where.push(`company_code = $${params.length}`);
    }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      const i = params.length;
      where.push(`(customer_name ILIKE $${i} OR customer_no ILIKE $${i} OR contact_name ILIKE $${i})`);
    }
    if (q.customerType) { params.push(q.customerType); where.push(`customer_type = $${params.length}`); }
    if (q.status)       { params.push(q.status);       where.push(`status = $${params.length}`); }
    if (q.riskLevel)    { params.push(q.riskLevel);    where.push(`risk_level = $${params.length}`); }
    if (q.channelCode)  { params.push(q.channelCode);  where.push(`channel_code = $${params.length}`); }

    const whereClause = where.join(' AND ');

    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_customers WHERE ${whereClause}`, params),
      this.ds.query(
        `SELECT * FROM sal_customers WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return {
      data: rows,
      total: Number(countRow[0].total),
      page,
      limit,
    };
  }

  async findById(id: string) {
    return this.assertOwnership(id);
  }

  async create(dto: CreateCustomerDto) {
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(dto.companyCode)) {
      throw new ForbiddenException(`无权在公司 ${dto.companyCode} 下创建客户`);
    }

    const customerNo = await this.genCustomerNo(dto.companyCode);

    const existing = await this.ds.query(
      `SELECT id FROM sal_customers WHERE customer_name = $1 AND company_code = $2 AND status != 'BLACKLIST'`,
      [dto.customerName, dto.companyCode],
    );
    if (existing?.length) throw new ConflictException(`公司 ${dto.companyCode} 下已存在同名客户：${dto.customerName}`);

    const result = await this.ds.query(
      `INSERT INTO sal_customers
        (customer_no, customer_name, customer_type, channel_code, company_code, company_name,
         region_code, credit_limit, payment_terms, risk_level, status,
         sales_rep_name, contact_name, contact_phone, delivery_address, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        customerNo, dto.customerName, dto.customerType,
        dto.channelCode ?? null, dto.companyCode, dto.companyName ?? null,
        dto.regionCode ?? null, dto.creditLimit ?? 0, dto.paymentTerms ?? 0,
        dto.riskLevel ?? 'NORMAL',
        dto.salesRepName ?? null, dto.contactName ?? null,
        dto.contactPhone ?? null, dto.deliveryAddress ?? null, dto.remark ?? null,
      ],
    );
    return result[0];
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'BLACKLIST') throw new ForbiddenException('黑名单客户不可编辑，请先解除黑名单');

    const sets: string[] = [];
    const params: any[] = [];

    const addSet = (col: string, val: any) => {
      if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
    };

    addSet('customer_name',   dto.customerName);
    addSet('customer_type',   dto.customerType);
    addSet('company_name',    dto.companyName);
    addSet('channel_code',    dto.channelCode);
    addSet('region_code',     dto.regionCode);
    addSet('payment_terms',   dto.paymentTerms);
    addSet('risk_level',      dto.riskLevel);
    addSet('sales_rep_name',  dto.salesRepName);
    addSet('contact_name',    dto.contactName);
    addSet('contact_phone',   dto.contactPhone);
    addSet('delivery_address',dto.deliveryAddress);
    addSet('remark',          dto.remark);

    if (!sets.length) return rec;

    sets.push(`updated_at = NOW()`);
    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_customers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return result[0];
  }

  async freeze(id: string, dto: FreezeCustomerDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'FROZEN') return rec;
    if (rec.status === 'BLACKLIST') throw new ForbiddenException('黑名单客户不可冻结操作');

    const result = await this.ds.query(
      `UPDATE sal_customers SET status = 'FROZEN', remark = COALESCE($1, remark), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [dto.remark ?? null, id],
    );
    return result[0];
  }

  async activate(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'ACTIVE') return rec;

    const result = await this.ds.query(
      `UPDATE sal_customers SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async blacklist(id: string, dto: BlacklistCustomerDto) {
    await this.assertOwnership(id);
    const result = await this.ds.query(
      `UPDATE sal_customers SET status = 'BLACKLIST', risk_level = 'BLACKLIST',
       remark = COALESCE($1, remark), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [dto.remark ?? null, id],
    );
    return result[0];
  }

  async updateCreditLimit(id: string, dto: UpdateCreditLimitDto) {
    await this.assertOwnership(id);
    const result = await this.ds.query(
      `UPDATE sal_customers
       SET credit_limit = $1,
           payment_terms = COALESCE($2, payment_terms),
           updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [dto.creditLimit, dto.paymentTerms ?? null, id],
    );
    return result[0];
  }

  /**
   * 按 customer_code + company_code 查信用快照（供 SalesOrdersService 内部调用）
   * 不走 assertOwnership，由调用方保证已做 DataScope 校验
   */
  async getCreditSnapshotByCode(customerCode: string, companyCode: string) {
    const rows = await this.ds.query(
      `SELECT * FROM sal_customers WHERE customer_code = $1 AND company_code = $2 LIMIT 1`,
      [customerCode, companyCode],
    );
    if (!rows.length) return null;
    const rec = rows[0];

    const arRows = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_RECEIVED','OVERDUE')) AS open_invoices,
         COALESCE(SUM(amount_original) FILTER (WHERE status IN ('OPEN','PARTIALLY_RECEIVED','OVERDUE')), 0) AS outstanding_amount,
         COALESCE(SUM(amount_original - received_amount_original) FILTER (WHERE status = 'OVERDUE'), 0) AS overdue_amount
       FROM fin_ar_invoices
       WHERE customer_code = $1`,
      [rec.customer_no ?? customerCode],
    );
    const ar = arRows[0];

    return {
      customerId:       rec.id,
      customerCode:     rec.customer_code,
      customerName:     rec.customer_name,
      companyCode:      rec.company_code,
      creditLimit:      Number(rec.credit_limit ?? 0),
      creditUsed:       Number(rec.credit_used  ?? 0),
      creditAvailable:  Number(rec.credit_limit ?? 0) - Number(rec.credit_used ?? 0),
      paymentTerms:     rec.payment_terms,
      riskLevel:        rec.risk_level,
      status:           rec.status,
      openInvoices:     Number(ar.open_invoices),
      outstandingAmount: Number(ar.outstanding_amount),
      overdueAmount:    Number(ar.overdue_amount),
      snapshotAt:       new Date().toISOString(),
    };
  }

  async getCreditSnapshot(id: string) {
    const rec = await this.assertOwnership(id);

    const arRows = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_RECEIVED','OVERDUE')) AS open_invoices,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('OPEN','PARTIALLY_RECEIVED','OVERDUE')), 0) AS outstanding_amount,
         COALESCE(SUM(amount - received_amount) FILTER (WHERE status = 'OVERDUE'), 0) AS overdue_amount
       FROM fin_ar_invoices
       WHERE customer_code = $1`,
      [rec.customer_no],
    );
    const ar = arRows[0];

    return {
      customerId:         rec.id,
      customerNo:         rec.customer_no,
      customerName:       rec.customer_name,
      companyCode:        rec.company_code,
      creditLimit:        Number(rec.credit_limit),
      creditUsed:         Number(rec.credit_used),
      creditAvailable:    Number(rec.credit_limit) - Number(rec.credit_used),
      paymentTerms:       rec.payment_terms,
      riskLevel:          rec.risk_level,
      status:             rec.status,
      openInvoices:       Number(ar.open_invoices),
      outstandingAmount:  Number(ar.outstanding_amount),
      overdueAmount:      Number(ar.overdue_amount),
      snapshotAt:         new Date().toISOString(),
    };
  }
}
