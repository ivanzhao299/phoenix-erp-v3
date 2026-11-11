import { resolveQuantity, savedQuantity, QuantitySnapshot } from '../../product-master/services/quantity-contract';
import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkuPolicy } from '../../product-master/services/sku-policy';
import { validateCompanyCommercialContext } from '../../product-master/services/commercial-context';
import { DataSource, EntityManager } from 'typeorm';
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
  private async resolveSkuInfo(manager: EntityManager, skuCode: unknown, companyCode: string) {
    // Preparing a price must not require sale_enabled: that flag is only enabled
    // after a confirmed price exists. Company applicability and a saleable grade
    // remain mandatory; stock-only COMPANY scope can therefore prepare a price.
    const code = SkuPolicy.code(skuCode);
    const [identity] = await manager.query('SELECT org_context_required,variety_code FROM product_skus WHERE sku_code=$1 FOR SHARE', [code]);
    const managed = identity?.org_context_required === true || identity?.variety_code != null;
    const context = managed ? await validateCompanyCommercialContext(manager, { companyCode,
      actor: this.cls.get('dataScope') as DataScopeContext }) : undefined;
    const sku = await SkuPolicy.requireUsable(manager, code, managed ? 'any' : 'sale', context?.companyCode);
    if (managed) {
      const [grade] = await manager.query('SELECT is_saleable FROM product_grades WHERE grade_code=$1 FOR SHARE', [sku.grade_code]);
      if (grade?.is_saleable !== true) throw new BadRequestException('SKU 等级不可销售，不能维护销售价格');
    }
    return { productCode: sku.product_code, gradeCodeStd: sku.grade_code, specCode: sku.spec_code, baseUnit: sku.base_unit,
      managed: sku.org_context_required === true || sku.variety_code != null };
  }

  private requireConfirmedInput(managed: boolean, currencyCode: unknown, quantityBasis: unknown) {
    if (managed && (typeof currencyCode !== 'string' || !currencyCode.trim() || currencyCode !== currencyCode.trim()
        || !['BASE', 'PACKAGE'].includes(String(quantityBasis)))) {
      throw new BadRequestException('新 SKU 报价必须明确币种和数量单位，禁止猜测默认值');
    }
  }

  private requireConfirmedSnapshot(sku: Awaited<ReturnType<PriceItemsService['resolveSkuInfo']>>, skuCode: string, snapshot: QuantitySnapshot | null) {
    if (!sku.managed) return;
    savedQuantity({ qty: 1, quantity_snapshot: snapshot });
    if (!snapshot || snapshot.skuCode !== skuCode || snapshot.productCode !== sku.productCode
        || snapshot.gradeCode !== sku.gradeCodeStd || snapshot.specCode !== sku.specCode || snapshot.baseUnit !== sku.baseUnit) {
      throw new BadRequestException('新 SKU 价格计量快照不完整或身份不符，禁止猜测修复');
    }
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
                pb.price_book_no, pb.company_code, pb.status AS book_status,
                (SELECT ps.sku_name FROM product_skus ps WHERE ps.sku_code = pi.sku_code LIMIT 1) AS sku_name,
                (SELECT ps.sku_name_en FROM product_skus ps WHERE ps.sku_code = pi.sku_code LIMIT 1) AS sku_name_en,
                (SELECT ps.sku_name_lo FROM product_skus ps WHERE ps.sku_code = pi.sku_code LIMIT 1) AS sku_name_lo,
                (SELECT p.product_name_zh FROM mst_products p WHERE p.product_code = pi.product_code LIMIT 1) AS product_name_zh,
                (SELECT p.product_name_en FROM mst_products p WHERE p.product_code = pi.product_code LIMIT 1) AS product_name_en,
                (SELECT p.product_name_lo FROM mst_products p WHERE p.product_code = pi.product_code LIMIT 1) AS product_name_lo,
                (SELECT g.grade_name FROM product_grades g WHERE g.grade_code = COALESCE(pi.grade_code_std, pi.grade_code) LIMIT 1) AS grade_name,
                (SELECT sp.spec_name FROM packaging_specs sp WHERE sp.spec_code = COALESCE(pi.spec_code, pi.packaging_spec) LIMIT 1) AS spec_name
         FROM sal_price_items pi
         JOIN sal_price_books pb ON pb.id = pi.price_book_id
         WHERE ${wc}
         ORDER BY pi.product_code, pi.grade_code, pi.packaging_spec, pi.id DESC
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

    return this.ds.transaction(async manager => {
      // Phase H3: 如果提供了 sku_code，校验并自动推导 productCode / gradeCodeStd / specCode
      let productCode  = dto.productCode;
      let gradeCodeStd = dto.gradeCodeStd ?? null;
      let specCode     = dto.specCode     ?? null;

      if (dto.skuCode !== undefined) {
        const skuInfo = await this.resolveSkuInfo(manager, dto.skuCode, book.company_code);
        this.requireConfirmedInput(skuInfo.managed, dto.currencyCode, dto.quantityBasis);
        productCode  = skuInfo.productCode;
        gradeCodeStd = skuInfo.gradeCodeStd;
        specCode     = skuInfo.specCode;
      }

      const result = await manager.query(`
        INSERT INTO sal_price_items
          (price_book_id, product_code, grade_code, packaging_spec,
           currency_code, unit_price, floor_price, ceiling_price,
           min_qty, max_qty, status,
           sku_code, grade_code_std, spec_code, quantity_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13,$14::jsonb)
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
        await resolveQuantity(manager, { qty: 1, skuCode: dto.skuCode, quantityBasis: dto.quantityBasis }),
      ]);
      return result[0];
    });
  }

  async updateItem(id: string, dto: UpdatePriceItemDto) {
    return this.ds.transaction(async manager => {
    const rows = await manager.query(`SELECT pi.*, pb.status AS book_status, pb.company_code
      FROM sal_price_items pi JOIN sal_price_books pb ON pb.id = pi.price_book_id WHERE pi.id = $1 FOR UPDATE OF pb,pi`, [id]);
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
    if (item.sku_code) {
      const [identity] = await manager.query('SELECT org_context_required,variety_code FROM product_skus WHERE sku_code=$1 FOR SHARE', [item.sku_code]);
      if (identity?.org_context_required === true || identity?.variety_code != null || dto.quantityBasis !== undefined) {
        const skuInfo = await this.resolveSkuInfo(manager, item.sku_code, item.company_code);
        this.requireConfirmedInput(skuInfo.managed, dto.currencyCode ?? item.currency_code, dto.quantityBasis ?? item.quantity_snapshot?.basis);
        if (dto.quantityBasis === undefined) this.requireConfirmedSnapshot(skuInfo, item.sku_code, item.quantity_snapshot);
      }
    }
    if (dto.quantityBasis !== undefined) {
      add('quantity_snapshot', await resolveQuantity(manager, { qty: 1, skuCode: item.sku_code, quantityBasis: dto.quantityBasis }));
    }

    if (!sets.length) return item;
    params.push(id);
    const result = await manager.query(
      `UPDATE sal_price_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return result[0];
    });
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

    return this.ds.transaction(async manager => {
      const results: any[] = [];
      for (const item of dto.items) {
        // Phase H3: 批量导入同样支持 sku_code 推导
        let productCode  = item.productCode;
        let gradeCodeStd = item.gradeCodeStd ?? null;
        let specCode     = item.specCode     ?? null;

        if (item.skuCode !== undefined) {
          const skuInfo = await this.resolveSkuInfo(manager, item.skuCode, book.company_code);
          this.requireConfirmedInput(skuInfo.managed, item.currencyCode, item.quantityBasis);
          productCode = skuInfo.productCode;
          gradeCodeStd = skuInfo.gradeCodeStd;
          specCode = skuInfo.specCode;
        }

        const r = await manager.query(`
          INSERT INTO sal_price_items
            (price_book_id, product_code, grade_code, packaging_spec,
             currency_code, unit_price, floor_price, ceiling_price,
             min_qty, max_qty, status,
             sku_code, grade_code_std, spec_code, quantity_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13,$14::jsonb)
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
          await resolveQuantity(manager, { qty: 1, skuCode: item.skuCode, quantityBasis: item.quantityBasis }),
        ]);
        if (r?.length) results.push(r[0]);
      }
      return { imported: results.length, total: dto.items.length };
    });
  }

  async copyFromBook(sourceBookId: string, targetBookId: string) {
    await this.assertBookOwnership(sourceBookId);
    const targetBook = await this.assertBookOwnership(targetBookId);
    if (targetBook.status === 'ACTIVE') {
      throw new ForbiddenException('目标价格册 ACTIVE 状态不可复制');
    }

    return this.ds.transaction(async manager => {
      const items = await manager.query(`SELECT * FROM sal_price_items WHERE price_book_id=$1 AND status='ACTIVE' ORDER BY id FOR SHARE`, [sourceBookId]);
      for (const item of items) {
        if (item.sku_code != null) {
          const sku = await this.resolveSkuInfo(manager, item.sku_code, targetBook.company_code);
          this.requireConfirmedInput(sku.managed, item.currency_code, item.quantity_snapshot?.basis);
          this.requireConfirmedSnapshot(sku, item.sku_code, item.quantity_snapshot);
          item.product_code = sku.productCode; item.grade_code_std = sku.gradeCodeStd; item.spec_code = sku.specCode;
        }
        await manager.query(`INSERT INTO sal_price_items
          (price_book_id,product_code,grade_code,packaging_spec,currency_code,unit_price,floor_price,ceiling_price,min_qty,max_qty,status,sku_code,grade_code_std,spec_code,quantity_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11,$12,$13,$14::jsonb)`,
          [targetBookId,item.product_code,item.grade_code,item.packaging_spec,item.currency_code,item.unit_price,item.floor_price,item.ceiling_price,item.min_qty,item.max_qty,item.sku_code,item.grade_code_std,item.spec_code,item.quantity_snapshot || null]);
      }
      return { copied: items.length };
    });
  }
}
