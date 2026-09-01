import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import {
  CreatePriceBookDto, UpdatePriceBookDto, QueryPriceBookDto, SubmitPriceBookDto,
} from '../dto/price-book.dto';

@Injectable()
export class PriceBooksService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      userId:       String(u?.userId ?? u?.id ?? '0'),
      userName:     String(u?.name ?? u?.username ?? ''),
      roles:        (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: scope ? scope.allowedCompanyCodes : [] as string[],
      scopeAll:     scope ? scope.isGlobal : false,
    };
  }

  private async assertOwnership(id: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM sal_price_books WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`价格册 ${id} 不存在`);
    const rec = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(rec.company_code)) {
        throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的价格册`);
      }
    }
    return rec;
  }

  private async genPriceBookNo(companyCode: string): Promise<string> {
    const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PB-${today}-`;
    const row = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM sal_price_books WHERE price_book_no LIKE $1`,
      [`${prefix}%`],
    );
    return `${prefix}${String(Number(row[0].cnt) + 1).padStart(5, '0')}`;
  }

  async listBooks(q: QueryPriceBookDto) {
    const user   = this.currentUser();
    const page   = Math.max(1, q.page  ?? 1);
    const limit  = Math.min(200, Math.max(1, q.limit ?? 50));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes); where.push(`company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }
    if (q.companyCode)  { params.push(q.companyCode);  where.push(`company_code = $${params.length}`); }
    if (q.storeCode)    { params.push(q.storeCode);    where.push(`store_code = $${params.length}`); }
    if (q.status)       { params.push(q.status);       where.push(`status = $${params.length}`); }
    if (q.channelCode)  { params.push(q.channelCode);  where.push(`channel_code = $${params.length}`); }
    if (q.customerCode) { params.push(q.customerCode); where.push(`customer_code = $${params.length}`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      const i = params.length;
      where.push(`(price_book_name ILIKE $${i} OR price_book_no ILIKE $${i})`);
    }

    const wc = where.join(' AND ');
    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_price_books WHERE ${wc}`, params),
      this.ds.query(
        `SELECT * FROM sal_price_books WHERE ${wc} ORDER BY priority ASC, created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  async findById(id: string) {
    const rec = await this.assertOwnership(id);
    // 附带明细数量统计
    const [stats] = await this.ds.query(
      `SELECT COUNT(*) AS item_count FROM sal_price_items WHERE price_book_id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    return { ...rec, activeItemCount: Number(stats.item_count) };
  }

  async createBook(dto: CreatePriceBookDto) {
    const user = this.currentUser();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(dto.companyCode)) {
        throw new ForbiddenException(`无权在公司 ${dto.companyCode} 下创建价格册`);
      }
    }
    const bookNo = await this.genPriceBookNo(dto.companyCode);
    const result = await this.ds.query(`
      INSERT INTO sal_price_books
        (price_book_no, price_book_name, company_code, company_name,
         store_code, channel_code, customer_code, priority, effective_from, effective_to,
         status, remark, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',$11,$12)
      RETURNING *
    `, [
      bookNo, dto.priceBookName, dto.companyCode, dto.companyName ?? null,
      dto.storeCode ?? null, dto.channelCode ?? null, dto.customerCode ?? null,
      dto.priority ?? 100, dto.effectiveFrom ?? null, dto.effectiveTo ?? null,
      dto.remark ?? null, user.userName || user.userId,
    ]);
    return result[0];
  }

  async updateBook(id: string, dto: UpdatePriceBookDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'ACTIVE') {
      throw new ForbiddenException('ACTIVE 状态的价格册不可直接编辑，请先失效后再修改');
    }
    if (!['DRAFT', 'REJECTED'].includes(rec.status) &&
        rec.status !== 'APPROVED' && rec.status !== 'PENDING_APPROVAL') {
      // allow editing DRAFT / back-to-DRAFT states
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    const add = (col: string, v: any) => {
      if (v !== undefined) { params.push(v); sets.push(`${col} = $${params.length}`); }
    };
    add('price_book_name', dto.priceBookName);
    add('company_name',    dto.companyName);
    add('store_code',      dto.storeCode);
    add('channel_code',    dto.channelCode);
    add('customer_code',   dto.customerCode);
    add('priority',        dto.priority);
    add('effective_from',  dto.effectiveFrom);
    add('effective_to',    dto.effectiveTo);
    add('remark',          dto.remark);

    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_price_books SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return result[0];
  }

  async submitBook(id: string, dto: SubmitPriceBookDto) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'DRAFT') {
      throw new BadRequestException(`只有 DRAFT 状态的价格册可提交审批，当前状态：${rec.status}`);
    }

    // 检查是否有明细
    const [cnt] = await this.ds.query(
      `SELECT COUNT(*) AS c FROM sal_price_items WHERE price_book_id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (Number(cnt.c) === 0) {
      throw new BadRequestException('价格册无有效明细，不可提交审批');
    }

    // 启动 Workflow 审批（使用事务，符合 ApprovalEngine 要求）
    let finalRec: any = null;
    await this.ds.transaction(async (mgr) => {
      const wf = await this.approvalEngine.startApproval({
        moduleCode:   'MENU_SALES2_PRICE',
        bizType:     'PRICE_BOOK_APPROVAL',
        bizId:       id,
        bizNo:       rec.price_book_no,
        amount:      0,
        companyCode: rec.company_code,
        companyName: rec.company_name ?? undefined,
        subject:     `价格册审批：${rec.price_book_name}`,
        pickedApproverId: dto.approverUserId,
      }, mgr);

      if (!wf) {
        // 无审批规则 → ApprovalEngine 已自动更新 status=APPROVED
        const rows = await mgr.query(
          `SELECT * FROM sal_price_books WHERE id = $1`, [id],
        );
        finalRec = { ...rows[0], _note: '无审批规则，已自动批准' };
      } else {
        const rows = await mgr.query(
          `UPDATE sal_price_books
           SET status = 'PENDING_APPROVAL', wf_instance_id = $1, updated_at = NOW()
           WHERE id = $2 RETURNING *`,
          [String(wf.id), id],
        );
        finalRec = rows[0];
      }
    });
    return finalRec;
  }

  async activateBook(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'APPROVED') {
      throw new BadRequestException(`只有 APPROVED 状态的价格册可激活，当前状态：${rec.status}`);
    }
    return this.ds.transaction(async mgr => {
      await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`price-book:${rec.company_code}`]);
      const conflicts = await mgr.query(`
        SELECT pi.id
          FROM sal_price_items pi
          JOIN sal_price_items other ON other.price_book_id=$1 AND other.status='ACTIVE'
          JOIN sal_price_books pb ON pb.id=pi.price_book_id
         WHERE pb.id<>$1 AND pb.status='ACTIVE' AND pb.company_code=$2
           AND COALESCE(pb.store_code,'')=COALESCE($3,'')
           AND COALESCE(pb.customer_code,'')=COALESCE($4,'')
           AND COALESCE(pb.channel_code,'')=COALESCE($5,'')
           AND pb.priority=$6 AND pi.status='ACTIVE'
           AND COALESCE(pi.sku_code,'')=COALESCE(other.sku_code,'')
           AND COALESCE(pi.product_code,'')=COALESCE(other.product_code,'')
           AND COALESCE(pi.grade_code,'')=COALESCE(other.grade_code,'')
           AND COALESCE(pi.packaging_spec,'')=COALESCE(other.packaging_spec,'')
           AND pi.currency_code=other.currency_code
           AND daterange(COALESCE(pb.effective_from,'-infinity'::date), COALESCE(pb.effective_to,'infinity'::date),'[]')
               && daterange(COALESCE($7::date,'-infinity'::date), COALESCE($8::date,'infinity'::date),'[]')
           AND numrange(COALESCE(pi.min_qty,'-infinity'::numeric), COALESCE(pi.max_qty,'infinity'::numeric),'[]')
               && numrange(COALESCE(other.min_qty,'-infinity'::numeric), COALESCE(other.max_qty,'infinity'::numeric),'[]')
         LIMIT 1`, [id, rec.company_code, rec.store_code, rec.customer_code, rec.channel_code,
          rec.priority, rec.effective_from, rec.effective_to]);
      if (conflicts.length) throw new BadRequestException('同 scope、商品、币种、优先级的生效期或数量区间重叠，禁止发布');
      const [row] = await mgr.query(
        `UPDATE sal_price_books SET status='ACTIVE', publish_version=publish_version+1, updated_at=NOW()
          WHERE id=$1 RETURNING *`, [id]);
      return row;
    });
  }

  async expireBook(id: string) {
    const rec = await this.assertOwnership(id);
    if (!['ACTIVE', 'APPROVED'].includes(rec.status)) {
      throw new BadRequestException(`只有 ACTIVE/APPROVED 状态的价格册可失效`);
    }
    const result = await this.ds.query(
      `UPDATE sal_price_books SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async restoreBook(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status !== 'CANCELLED') {
      throw new BadRequestException(`只有 CANCELLED 状态的价格册可恢复，当前状态：${rec.status}`);
    }

    const [cnt] = await this.ds.query(
      `SELECT COUNT(*) AS c FROM sal_price_items WHERE price_book_id = $1 AND status = 'ACTIVE'`,
      [id],
    );
    if (Number(cnt.c) === 0) {
      throw new BadRequestException('价格册无有效明细，不可恢复为在用状态');
    }

    const result = await this.ds.query(
      `UPDATE sal_price_books
       SET status = 'ACTIVE', wf_instance_id = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async cancelBook(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'CANCELLED') return rec;
    if (rec.status === 'ACTIVE') {
      throw new BadRequestException('ACTIVE 价格册需先失效后再取消');
    }
    const result = await this.ds.query(
      `UPDATE sal_price_books SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async deleteBook(id: string) {
    const rec = await this.assertOwnership(id);
    if (!['DRAFT', 'CANCELLED'].includes(rec.status)) {
      throw new BadRequestException(`只有 DRAFT 或无明细的 CANCELLED 价格册可删除，当前状态：${rec.status}`);
    }

    const [usage] = await this.ds.query(`
      SELECT
        (SELECT COUNT(*) FROM sal_price_items WHERE price_book_id = $1) AS item_count,
        (SELECT COUNT(*) FROM sal_sales_orders WHERE price_book_id = $1) AS order_count,
        (SELECT COUNT(*) FROM sal_order_items WHERE price_book_id = $1) AS order_item_count
    `, [id]);
    const itemCount = Number(usage?.item_count ?? 0);
    const orderCount = Number(usage?.order_count ?? 0);
    const orderItemCount = Number(usage?.order_item_count ?? 0);
    if (orderCount > 0 || orderItemCount > 0) {
      throw new BadRequestException('价格册已被销售单据引用，不可删除');
    }
    if (rec.status === 'CANCELLED' && itemCount > 0) {
      throw new BadRequestException('已取消价格册仍有价格明细，只能保留归档，不可删除');
    }

    await this.ds.transaction(async (mgr) => {
      await mgr.query(`DELETE FROM sal_price_items WHERE price_book_id = $1`, [id]);
      await mgr.query(`DELETE FROM sal_price_books WHERE id = $1`, [id]);
    });

    return {
      deleted: true,
      id: String(rec.id),
      priceBookNo: rec.price_book_no,
      priceBookName: rec.price_book_name,
    };
  }
}
