import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * ProductMasterService — Phase H2
 *
 * 管理三张产品主数据表：
 *   1. product_grades    — 等级主数据（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）
 *   2. packaging_specs   — 包装规格主数据（TRAY30/BOX360/GIFT12 等）
 *   3. product_skus      — SKU 主数据（product + grade + spec 组合）
 *
 * Phase H2 约束：
 *   - 本服务只管理主数据层，不修改任何交易表
 *   - 不做 grade_code 迁移（H4 完成）
 *   - 不做价格/库存接入（H3/H4 完成）
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ProductGrade {
  id?: number;
  grade_code: string;
  grade_name: string;
  grade_name_lo?: string;
  sort_order?: number;
  is_saleable?: boolean;
  is_storable?: boolean;
  status?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PackagingSpec {
  id?: number;
  spec_code: string;
  spec_name: string;
  spec_name_lo?: string;
  qty_per_unit?: number;
  base_unit?: string;
  display_unit?: string;
  sort_order?: number;
  status?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductSku {
  id?: number;
  sku_code: string;
  product_code: string;
  product_name?: string;
  grade_code: string;
  spec_code: string;
  sku_name?: string;
  barcode?: string;
  status?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

// ────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────

@Injectable()
export class ProductMasterService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
  ) {}

  // ── product_grades ──────────────────────────────────────────────

  async listGrades(status?: string): Promise<ProductGrade[]> {
    const cond = status ? `WHERE status = $1` : `WHERE status = 'ACTIVE'`;
    const args = status ? [status] : [];
    return this.em.query(
      `SELECT * FROM product_grades ${cond} ORDER BY sort_order, grade_code`,
      args,
    );
  }

  async listAllGrades(): Promise<ProductGrade[]> {
    return this.em.query(
      `SELECT * FROM product_grades ORDER BY sort_order, grade_code`,
    );
  }

  async getGrade(gradeCode: string): Promise<ProductGrade> {
    const rows = await this.em.query(
      `SELECT * FROM product_grades WHERE grade_code = $1 LIMIT 1`,
      [gradeCode],
    );
    if (!rows.length) throw new NotFoundException(`Grade ${gradeCode} not found`);
    return rows[0];
  }

  async createGrade(dto: ProductGrade): Promise<ProductGrade> {
    // 必填校验前置：空 body 直插会触 grade_code NOT NULL → 500；应返 400
    if (!dto?.grade_code || !dto?.grade_name) {
      throw new BadRequestException('grade_code / grade_name 必填');
    }
    const exists = await this.em.query(
      `SELECT 1 FROM product_grades WHERE grade_code = $1`,
      [dto.grade_code],
    );
    if (exists.length) throw new ConflictException(`grade_code ${dto.grade_code} already exists`);
    const rows = await this.em.query(
      `INSERT INTO product_grades
         (grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, status, remark, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING *`,
      [
        dto.grade_code, dto.grade_name, dto.grade_name_lo ?? null,
        dto.sort_order ?? 99,
        dto.is_saleable ?? true, dto.is_storable ?? true,
        dto.status ?? 'ACTIVE', dto.remark ?? null,
      ],
    );
    return rows[0];
  }

  async updateGrade(gradeCode: string, dto: Partial<ProductGrade>): Promise<ProductGrade> {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    if (dto.grade_name     !== undefined) { sets.push(`grade_name=$${i++}`);     args.push(dto.grade_name); }
    if (dto.grade_name_lo  !== undefined) { sets.push(`grade_name_lo=$${i++}`);  args.push(dto.grade_name_lo); }
    if (dto.sort_order     !== undefined) { sets.push(`sort_order=$${i++}`);     args.push(dto.sort_order); }
    if (dto.is_saleable    !== undefined) { sets.push(`is_saleable=$${i++}`);    args.push(dto.is_saleable); }
    if (dto.is_storable    !== undefined) { sets.push(`is_storable=$${i++}`);    args.push(dto.is_storable); }
    if (dto.status         !== undefined) { sets.push(`status=$${i++}`);         args.push(dto.status); }
    if (dto.remark         !== undefined) { sets.push(`remark=$${i++}`);         args.push(dto.remark); }
    if (!sets.length) return this.getGrade(gradeCode);
    sets.push(`updated_at=NOW()`);
    args.push(gradeCode);
    const rows = await this.em.query(
      `UPDATE product_grades SET ${sets.join(',')} WHERE grade_code=$${i} RETURNING *`,
      args,
    );
    if (!rows.length) throw new NotFoundException(`Grade ${gradeCode} not found`);
    return rows[0];
  }

  // ── packaging_specs ─────────────────────────────────────────────

  async listSpecs(status?: string): Promise<PackagingSpec[]> {
    const cond = status ? `WHERE status = $1` : `WHERE status = 'ACTIVE'`;
    const args = status ? [status] : [];
    return this.em.query(
      `SELECT * FROM packaging_specs ${cond} ORDER BY sort_order, spec_code`,
      args,
    );
  }

  async listAllSpecs(): Promise<PackagingSpec[]> {
    return this.em.query(
      `SELECT * FROM packaging_specs ORDER BY sort_order, spec_code`,
    );
  }

  async getSpec(specCode: string): Promise<PackagingSpec> {
    const rows = await this.em.query(
      `SELECT * FROM packaging_specs WHERE spec_code = $1 LIMIT 1`,
      [specCode],
    );
    if (!rows.length) throw new NotFoundException(`Spec ${specCode} not found`);
    return rows[0];
  }

  async createSpec(dto: PackagingSpec): Promise<PackagingSpec> {
    const exists = await this.em.query(
      `SELECT 1 FROM packaging_specs WHERE spec_code = $1`,
      [dto.spec_code],
    );
    if (exists.length) throw new ConflictException(`spec_code ${dto.spec_code} already exists`);
    const rows = await this.em.query(
      `INSERT INTO packaging_specs
         (spec_code, spec_name, spec_name_lo, qty_per_unit, base_unit, display_unit, sort_order, status, remark, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [
        dto.spec_code, dto.spec_name, dto.spec_name_lo ?? null,
        dto.qty_per_unit ?? 1, dto.base_unit ?? '枚', dto.display_unit ?? '枚',
        dto.sort_order ?? 99, dto.status ?? 'ACTIVE', dto.remark ?? null,
      ],
    );
    return rows[0];
  }

  async updateSpec(specCode: string, dto: Partial<PackagingSpec>): Promise<PackagingSpec> {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    if (dto.spec_name      !== undefined) { sets.push(`spec_name=$${i++}`);      args.push(dto.spec_name); }
    if (dto.spec_name_lo   !== undefined) { sets.push(`spec_name_lo=$${i++}`);   args.push(dto.spec_name_lo); }
    if (dto.qty_per_unit   !== undefined) { sets.push(`qty_per_unit=$${i++}`);   args.push(dto.qty_per_unit); }
    if (dto.base_unit      !== undefined) { sets.push(`base_unit=$${i++}`);      args.push(dto.base_unit); }
    if (dto.display_unit   !== undefined) { sets.push(`display_unit=$${i++}`);   args.push(dto.display_unit); }
    if (dto.sort_order     !== undefined) { sets.push(`sort_order=$${i++}`);     args.push(dto.sort_order); }
    if (dto.status         !== undefined) { sets.push(`status=$${i++}`);         args.push(dto.status); }
    if (dto.remark         !== undefined) { sets.push(`remark=$${i++}`);         args.push(dto.remark); }
    if (!sets.length) return this.getSpec(specCode);
    sets.push(`updated_at=NOW()`);
    args.push(specCode);
    const rows = await this.em.query(
      `UPDATE packaging_specs SET ${sets.join(',')} WHERE spec_code=$${i} RETURNING *`,
      args,
    );
    if (!rows.length) throw new NotFoundException(`Spec ${specCode} not found`);
    return rows[0];
  }

  // ── product_skus ────────────────────────────────────────────────

  async listSkus(filters?: { product_code?: string; grade_code?: string; spec_code?: string; status?: string }): Promise<ProductSku[]> {
    const conds: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    if (filters?.product_code) { conds.push(`product_code=$${i++}`); args.push(filters.product_code); }
    if (filters?.grade_code)   { conds.push(`grade_code=$${i++}`);   args.push(filters.grade_code); }
    if (filters?.spec_code)    { conds.push(`spec_code=$${i++}`);    args.push(filters.spec_code); }
    if (filters?.status)       { conds.push(`status=$${i++}`);       args.push(filters.status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : `WHERE status = 'ACTIVE'`;
    return this.em.query(
      `SELECT * FROM product_skus ${where} ORDER BY product_code, grade_code, spec_code`,
      args,
    );
  }

  async getSku(skuCode: string): Promise<ProductSku> {
    const rows = await this.em.query(
      `SELECT * FROM product_skus WHERE sku_code = $1 LIMIT 1`,
      [skuCode],
    );
    if (!rows.length) throw new NotFoundException(`SKU ${skuCode} not found`);
    return rows[0];
  }

  async createSku(dto: ProductSku): Promise<ProductSku> {
    // 检查三元组唯一性
    const combo = await this.em.query(
      `SELECT 1 FROM product_skus WHERE product_code=$1 AND grade_code=$2 AND spec_code=$3`,
      [dto.product_code, dto.grade_code, dto.spec_code],
    );
    if (combo.length) throw new ConflictException(
      `SKU with (product=${dto.product_code}, grade=${dto.grade_code}, spec=${dto.spec_code}) already exists`,
    );

    // 自动生成 sku_code（如未提供）
    const skuCode = dto.sku_code || this.generateSkuCode(dto.product_code, dto.grade_code, dto.spec_code);

    // 尝试从 mst_products 查询产品名
    let productName = dto.product_name;
    if (!productName) {
      const prows = await this.em.query(
        `SELECT product_name_zh FROM mst_products WHERE product_code=$1 LIMIT 1`,
        [dto.product_code],
      ).catch(() => []);
      productName = prows[0]?.product_name_zh || dto.product_code;
    }

    const skuName = dto.sku_name || `${productName} (${dto.grade_code} / ${dto.spec_code})`;

    const rows = await this.em.query(
      `INSERT INTO product_skus
         (sku_code, product_code, product_name, grade_code, spec_code, sku_name, barcode, status, remark, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [
        skuCode, dto.product_code, productName, dto.grade_code, dto.spec_code,
        skuName, dto.barcode ?? null, dto.status ?? 'ACTIVE', dto.remark ?? null,
      ],
    );
    return rows[0];
  }

  async updateSku(skuCode: string, dto: Partial<ProductSku>): Promise<ProductSku> {
    const sets: string[] = [];
    const args: unknown[] = [];
    let i = 1;
    if (dto.product_name !== undefined) { sets.push(`product_name=$${i++}`); args.push(dto.product_name); }
    if (dto.sku_name     !== undefined) { sets.push(`sku_name=$${i++}`);     args.push(dto.sku_name); }
    if (dto.barcode      !== undefined) { sets.push(`barcode=$${i++}`);      args.push(dto.barcode); }
    if (dto.status       !== undefined) { sets.push(`status=$${i++}`);       args.push(dto.status); }
    if (dto.remark       !== undefined) { sets.push(`remark=$${i++}`);       args.push(dto.remark); }
    if (!sets.length) return this.getSku(skuCode);
    sets.push(`updated_at=NOW()`);
    args.push(skuCode);
    const rows = await this.em.query(
      `UPDATE product_skus SET ${sets.join(',')} WHERE sku_code=$${i} RETURNING *`,
      args,
    );
    if (!rows.length) throw new NotFoundException(`SKU ${skuCode} not found`);
    return rows[0];
  }

  /** 根据 product+grade+spec 自动生成 sku_code。示例：EGG-AA-TRAY30 */
  private generateSkuCode(productCode: string, gradeCode: string, specCode: string): string {
    const product = productCode.replace(/^PRD-/, '').replace(/-RAW$/, '').toUpperCase();
    return `${product}-${gradeCode}-${specCode}`;
  }

  // ── mst_products（只读查询，H2 阶段不提供写接口）──────────────

  async listProducts(status = 'ACTIVE'): Promise<Record<string, unknown>[]> {
    return this.em.query(
      `SELECT * FROM mst_products WHERE status = $1 ORDER BY category_code, product_code`,
      [status],
    ).catch(() => this.em.query(
      `SELECT * FROM mst_products WHERE status = 'ACTIVE' ORDER BY product_code`,
    ));
  }
}
