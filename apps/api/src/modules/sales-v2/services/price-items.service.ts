import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import {
  CreatePriceItemDto, UpdatePriceItemDto, QueryPriceItemDto, BulkImportPriceItemDto,
} from '../dto/price-item.dto';

@Injectable()
export class PriceItemsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      companyCodes: (u?.companyCodes ?? []) as string[],
      scopeAll:     !!(u?.scopeAll),
    };
  }

  /** 检查价格册归属，同时验证 DataScope */
  private async assertBookOwnership(bookId: string | number): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, company_code, status FROM sal_price_books WHERE id = $1`, [bookId],
    );
    if (!rows?.length) throw new NotFoundException(`价格册 ${bookId} 不存在`);
    const book = rows[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(book.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${book.company_code} 的价格册`);
    }
    return book;
  }

  async listItems(q: QueryPriceItemDto) {
    const user   = this.currentUser();
    const page   = Math.max(1, q.page  ?? 1);
    const limit  = Math.min(500, Math.max(1, q.limit ?? 100));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['pi.status != \'DELETED\''];

    if (q.priceBookId) { params.push(q.priceBookId); where.push(`pi.price_book_id = $${params.length}`); }
    if (q.productCode) { params.push(q.productCode); where.push(`pi.product_code = $${params.length}`); }
    if (q.gradeCode)   { params.push(q.gradeCode);   where.push(`pi.grade_code = $${params.length}`); }
    if (q.packagingSpec) { params.push(q.packagingSpec); where.push(`pi.packaging_spec = $${params.length}`); }
    if (q.status)      { params.push(q.status);      where.push(`pi.status = $${params.length}`); }

    // DataScope 通过 price_book 过滤
    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      where.push(`pb.company_code = ANY($${params.length})`);
    }

    const wc = where.join(' AND ');
    const [countRow, rows] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) AS total FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE ${wc}`,
        params,
      ),
      this.ds.query(
        `SELECT pi.*, pb.price_book_no, pb.company_code, pb.status AS book_status
         FROM sal_price_items pi
         JOIN sal_price_books pb ON pb.id = pi.price_book_id
         WHERE ${wc}
         ORDER BY pi.product_code, pi.grade_code, pi.packaging_spec
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return { data: rows, total: Number(countRow[0].total), page, limit };
  }

  async createItem(dto: CreatePriceItemDto) {
    const book = await this.assertBookOwnership(dto.priceBookId);
    if (book.status === 'ACTIVE') {
      throw new ForbiddenException('ACTIVE 价格册不可添加明细，请先失效后操作');
    }

    const result = await this.ds.query(`
      INSERT INTO sal_price_items
        (price_book_id, product_code, grade_code, packaging_spec,
         currency_code, unit_price, floor_price, ceiling_price,
         min_qty, max_qty, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE')
      RETURNING *
    `, [
      dto.priceBookId, dto.productCode,
      dto.gradeCode    ?? null, dto.packagingSpec ?? null,
      dto.currencyCode ?? 'LAK',
      dto.unitPrice,
      dto.floorPrice   ?? null, dto.ceilingPrice  ?? null,
      dto.minQty       ?? null, dto.maxQty        ?? null,
    ]);
    return result[0];
  }

  async updateItem(id: string, dto: UpdatePriceItemDto) {
    const rows = await this.ds.query(`SELECT pi.*, pb.status AS book_status, pb.company_code
      FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE pi.id = $1`, [id]);
    if (!rows?.length) throw new NotFoundException(`价格明细 ${id} 不存在`);
    const item = rows[0];

    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(item.company_code)) {
      throw new ForbiddenException('无权操作此价格明细');
    }
    if (item.book_status === 'ACTIVE') {
      throw new ForbiddenException('ACTIVE 价格册的明细不可直接编辑');
    }

    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, v: any) => {
      if (v !== undefined) { params.push(v); sets.push(`${col} = $${params.length}`); }
    };
    add('unit_price',    dto.unitPrice);
    add('floor_price',   dto.floorPrice);
    add('ceiling_price', dto.ceilingPrice);
    add('min_qty',       dto.minQty);
    add('max_qty',       dto.maxQty);
    add('currency_code', dto.currencyCode);

    if (!sets.length) return item;
    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_price_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return result[0];
  }

  async disableItem(id: string) {
    const rows = await this.ds.query(`SELECT pi.*, pb.status AS book_status, pb.company_code
      FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE pi.id = $1`, [id]);
    if (!rows?.length) throw new NotFoundException(`价格明细 ${id} 不存在`);
    const item = rows[0];

    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(item.company_code)) {
      throw new ForbiddenException('无权操作此价格明细');
    }

    const result = await this.ds.query(
      `UPDATE sal_price_items SET status = 'DISABLED' WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async bulkImport(dto: BulkImportPriceItemDto) {
    const book = await this.assertBookOwnership(dto.priceBookId);
    if (book.status === 'ACTIVE') {
      throw new ForbiddenException('ACTIVE 价格册不可批量导入，请先失效后操作');
    }
    if (!dto.items?.length) throw new BadRequestException('导入数据不可为空');
    if (dto.items.length > 500) throw new BadRequestException('单次批量导入上限 500 条');

    const results: any[] = [];
    for (const item of dto.items) {
      const r = await this.ds.query(`
        INSERT INTO sal_price_items
          (price_book_id, product_code, grade_code, packaging_spec,
           currency_code, unit_price, floor_price, ceiling_price,
           min_qty, max_qty, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE')
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [
        dto.priceBookId, item.productCode,
        item.gradeCode    ?? null, item.packagingSpec ?? null,
        item.currencyCode ?? 'LAK',
        item.unitPrice,
        item.floorPrice   ?? null, item.ceilingPrice  ?? null,
        item.minQty       ?? null, item.maxQty        ?? null,
      ]);
      if (r?.length) results.push(r[0]);
    }
    return { imported: results.length, total: dto.items.length };
  }

  async copyFromBook(sourceBookId: string, targetBookId: string) {
    await this.assertBookOwnership(sourceBookId);
    const targetBook = await this.assertBookOwnership(targetBookId);
    if (targetBook.status === 'ACTIVE') {
      throw new ForbiddenException('目标价格册 ACTIVE 状态不可复制');
    }

    const result = await this.ds.query(`
      INSERT INTO sal_price_items
        (price_book_id, product_code, grade_code, packaging_spec,
         currency_code, unit_price, floor_price, ceiling_price, min_qty, max_qty, status)
      SELECT $1, product_code, grade_code, packaging_spec,
             currency_code, unit_price, floor_price, ceiling_price, min_qty, max_qty, 'ACTIVE'
      FROM sal_price_items
      WHERE price_book_id = $2 AND status = 'ACTIVE'
    `, [targetBookId, sourceBookId]);

    return { copied: result?.affectedRows ?? result?.rowCount ?? 0 };
  }
}
