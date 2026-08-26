import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';
import {
  CreatePriceItemDto, UpdatePriceItemDto, QueryPriceItemDto, BulkImportPriceItemDto,
} from '../dto/price-item.dto';

@Injectable()
export class PriceItemsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private getScope(): { companyCodes: string[]; scopeAll: boolean } {
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return scope
      ? { companyCodes: scope.allowedCompanyCodes, scopeAll: scope.isGlobal }
      : { companyCodes: [], scopeAll: false };
  }

  /** 检查价格册归属，同时验证 DataScope */
  private async assertBookOwnership(bookId: string | number): Promise<any> {
    const rows = await this.ds.query(
      `SELECT id, company_code, status FROM sal_price_books WHERE id = $1`, [bookId],
    );
    if (!rows?.length) throw new NotFoundException(`价格册 ${bookId} 不存在`);
    const book = rows[0];
    const user = this.getScope();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(book.company_code)) {
        throw new ForbiddenException(`无权访问公司 ${book.company_code} 的价格册`);
      }
    }
    return book;
  }

  /**
   * Phase H3: 根据 sku_code 查询 product_skus，返回推导出的 productCode/gradeCodeStd/specCode
   * 仅在 dto.skuCode 存在时调用
   */
  private async resolveSkuInfo(skuCode: string): Promise<{ productCode: string; gradeCodeStd: string; specCode: string }> {
    const rows = await this.ds.query(
      `SELECT product_code, grade_code, spec_code
         FROM product_skus
        WHERE sku_code = $1
          AND status = 'ACTIVE'
          AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
          AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)`,
      [skuCode],
    );
    if (!rows?.length) {
      throw new BadRequestException(`SKU "${skuCode}" 不存在、已停用或不在生效期，请先在主数据中心维护 SKU 档案`);
    }
    const sku = rows[0];
    return {
      productCode:  sku.product_code,
      gradeCodeStd: sku.grade_code,
      specCode:     sku.spec_code,
    };
  }

  async listItems(q: QueryPriceItemDto) {
    const user   = this.getScope();
    const page   = Math.max(1, q.page  ?? 1);
    const limit  = Math.min(500, Math.max(1, q.limit ?? 100));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['pi.status != \'DELETED\''];

    if (q.priceBookId)  { params.push(q.priceBookId);  where.push(`pi.price_book_id = $${params.length}`); }
    if (q.productCode)  { params.push(q.productCode);  where.push(`pi.product_code = $${params.length}`); }
    if (q.gradeCode)    { params.push(q.gradeCode);    where.push(`pi.grade_code = $${params.length}`); }
    if (q.packagingSpec){ params.push(q.packagingSpec); where.push(`pi.packaging_spec = $${params.length}`); }
    // Phase H3 新增筛选项
    if (q.skuCode)      { params.push(q.skuCode);      where.push(`pi.sku_code = $${params.length}`); }
    if (q.gradeCodeStd) { params.push(q.gradeCodeStd); where.push(`pi.grade_code_std = $${params.length}`); }
    if (q.specCode)     { params.push(q.specCode);     where.push(`pi.spec_code = $${params.length}`); }
    if (q.status)       { params.push(q.status);       where.push(`pi.status = $${params.length}`); }

    // DataScope 通过 price_book 过滤
    if (!user.scopeAll) {
      if (user.companyCodes.length > 0) {
        params.push(user.companyCodes);
        where.push(`pb.company_code = ANY($${params.length})`);
      } else {
        where.push('1=0');  // 未配置数据范围 → 拒绝访问
      }
    }

    const wc = where.join(' AND ');
    const [countRow, rows] = await Promise.all([
      this.ds.query(
        `SELECT COUNT(*) AS total FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE ${wc}`,
        params,
      ),
      this.ds.query(
        `SELECT pi.*,
                pb.price_book_no, pb.company_code, pb.status AS book_status
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

    // Phase H3: 如果提供了 sku_code，校验并自动推导 productCode / gradeCodeStd / specCode
    let productCode  = dto.productCode;
    let gradeCodeStd = dto.gradeCodeStd ?? null;
    let specCode     = dto.specCode     ?? null;

    if (dto.skuCode) {
      const skuInfo = await this.resolveSkuInfo(dto.skuCode);
      productCode  = skuInfo.productCode;
      gradeCodeStd = skuInfo.gradeCodeStd;
      specCode     = skuInfo.specCode;
    }

    const result = await this.ds.query(`
      INSERT INTO sal_price_items
        (price_book_id, product_code, grade_code, packaging_spec,
         currency_code, unit_price, floor_price, ceiling_price,
         min_qty, max_qty, status,
         sku_code, grade_code_std, spec_code)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13)
      RETURNING *
    `, [
      dto.priceBookId, productCode,
      dto.gradeCode    ?? null, dto.packagingSpec ?? null,
      dto.currencyCode ?? 'LAK',
      dto.unitPrice,
      dto.floorPrice   ?? null, dto.ceilingPrice  ?? null,
      dto.minQty       ?? null, dto.maxQty        ?? null,
      dto.skuCode      ?? null,
      gradeCodeStd,
      specCode,
    ]);
    return result[0];
  }

  async updateItem(id: string, dto: UpdatePriceItemDto) {
    const rows = await this.ds.query(`SELECT pi.*, pb.status AS book_status, pb.company_code
      FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE pi.id = $1`, [id]);
    if (!rows?.length) throw new NotFoundException(`价格明细 ${id} 不存在`);
    const item = rows[0];

    const user = this.getScope();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(item.company_code)) {
        throw new ForbiddenException('无权操作此价格明细');
      }
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

    const user = this.getScope();
    if (!user.scopeAll) {
      if (user.companyCodes.length === 0 || !user.companyCodes.includes(item.company_code)) {
        throw new ForbiddenException('无权操作此价格明细');
      }
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
      // Phase H3: 批量导入同样支持 sku_code 推导
      let productCode  = item.productCode;
      let gradeCodeStd = item.gradeCodeStd ?? null;
      let specCode     = item.specCode     ?? null;

      if (item.skuCode) {
        try {
          const skuInfo = await this.resolveSkuInfo(item.skuCode);
          productCode  = skuInfo.productCode;
          gradeCodeStd = skuInfo.gradeCodeStd;
          specCode     = skuInfo.specCode;
        } catch {
          // SKU 无效时跳过该条，继续处理下一条
          continue;
        }
      }

      const r = await this.ds.query(`
        INSERT INTO sal_price_items
          (price_book_id, product_code, grade_code, packaging_spec,
           currency_code, unit_price, floor_price, ceiling_price,
           min_qty, max_qty, status,
           sku_code, grade_code_std, spec_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13)
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [
        dto.priceBookId, productCode,
        item.gradeCode    ?? null, item.packagingSpec ?? null,
        item.currencyCode ?? 'LAK',
        item.unitPrice,
        item.floorPrice   ?? null, item.ceilingPrice  ?? null,
        item.minQty       ?? null, item.maxQty        ?? null,
        item.skuCode      ?? null,
        gradeCodeStd,
        specCode,
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

    // Phase H3: 复制时同步带上 sku_code / grade_code_std / spec_code
    const result = await this.ds.query(`
      INSERT INTO sal_price_items
        (price_book_id, product_code, grade_code, packaging_spec,
         currency_code, unit_price, floor_price, ceiling_price, min_qty, max_qty, status,
         sku_code, grade_code_std, spec_code)
      SELECT $1, product_code, grade_code, packaging_spec,
             currency_code, unit_price, floor_price, ceiling_price, min_qty, max_qty, 'ACTIVE',
             sku_code, grade_code_std, spec_code
      FROM sal_price_items
      WHERE price_book_id = $2 AND status = 'ACTIVE'
    `, [targetBookId, sourceBookId]);

    return { copied: result?.affectedRows ?? result?.rowCount ?? 0 };
  }
}
