import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CodeGeneratorService } from '../../master-data/code-generator.service';
import { MasterDataAuditService, MdAction } from '../../master-data/master-data-audit.service';
import { SkuPolicy, SKU_IDENTITY_FIELDS } from './sku-policy';

const WRITABLE = ['sku_name', 'sku_name_en', 'sku_name_lo', ...SKU_IDENTITY_FIELDS, 'barcode', 'effective_date', 'expire_date', 'remark'];
// Parent-derived classification is never a client-writable identity dimension.
const INTERNAL_DERIVED = ['variety_code', 'org_context_required'];
type Row = Record<string, any>;

/** One domain writer; both HTTP adapters use this through Runtime. No Nest module dependency. */
export class SkuWriter {
  constructor(private readonly ds: DataSource, private readonly codes: CodeGeneratorService, private readonly audit: MasterDataAuditService) {}

  private static rows(raw: any): Row[] {
    return Array.isArray(raw?.[0]) && typeof raw?.[1] === 'number' ? raw[0] : raw;
  }

  private static date(value: unknown, field: string): string | null {
    if (value == null || value === '') return null;
    const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)
      || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) {
      throw new BadRequestException(`${field} 必须为合法 YYYY-MM-DD 日期`);
    }
    return text;
  }

  static async checkReferences(manager: Pick<EntityManager, 'query'>, row: Row, lock = false): Promise<{ records: Record<string, Row>; problems: string[] }> {
    const records: Record<string, Row> = {};
    const problems: string[] = [];
    for (const [table, key] of [['mst_products', 'product_code'], ['product_grades', 'grade_code'], ['packaging_specs', 'spec_code']]) {
      const [reference] = await manager.query(`SELECT * FROM ${table} WHERE ${key}=$1${lock ? ' FOR SHARE' : ''}`, [row[key]]);
      if (!reference || reference.status !== 'ACTIVE') problems.push(`${key}=${row[key]}`);
      else records[key] = reference;
    }
    return { records, problems };
  }

  /** Also usable by reviewed imports inside their existing transaction; never swallows SQL failures. */
  static async prepare(manager: Pick<EntityManager, 'query'>, dto: Row, before?: Row, activating = false): Promise<Row> {
    const row: Row = before ? { ...before } : {};
    for (const field of WRITABLE) {
      if (dto[field] === undefined) continue;
      const value = dto[field];
      if (value !== null && typeof value !== 'string') throw new BadRequestException(`${field} 必须为文本`);
      row[field] = typeof value === 'string' ? value.trim() : value;
    }
    for (const field of SKU_IDENTITY_FIELDS) {
      if (typeof row[field] !== 'string' || !row[field].trim()) throw new BadRequestException(`${field} 必填`);
      // Identity is exact; whitespace must never silently select a different identity.
      if (dto[field] !== undefined && dto[field] !== row[field]) throw new BadRequestException(`${field} 不能含首尾空格`);
    }
    if (!before || activating || dto.effective_date !== undefined || dto.expire_date !== undefined) {
      row.effective_date = SkuWriter.date(row.effective_date, 'effective_date');
      row.expire_date = SkuWriter.date(row.expire_date, 'expire_date');
      if (row.effective_date && row.expire_date && row.effective_date > row.expire_date) throw new BadRequestException('生效日期不能晚于失效日期');
    }
    if (!before || dto.barcode !== undefined) row.barcode = row.barcode || null;
    if ((!before || dto.barcode !== undefined || activating) && row.barcode != null && (typeof row.barcode !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(row.barcode))) throw new BadRequestException('条码须为 1~64 位可打印 ASCII 字符且不含空格');

    const identityChanged = !before || SKU_IDENTITY_FIELDS.some(field => row[field] !== before[field]);
    // Historical descriptions stay editable when a parent master has since been frozen.
    // Creating, changing identity or activating a SKU always requires all three ACTIVE references.
    if (identityChanged || activating) {
      const { records, problems } = await this.checkReferences(manager, row, true);
      if (problems.length) throw new BadRequestException(`引用不存在或未启用：${problems.join('、')}`);
      const product = records.product_code;
      const variety = product.variety_code;
      // Explicit SQL NULL means STANDARD. Missing metadata must fail closed, not become STANDARD.
      if (variety !== null && (typeof variety !== 'string' || !variety.trim() || variety !== variety.trim())) {
        throw new BadRequestException('父产品缺少有效 variety_code 元数据（STANDARD 必须明确 NULL）');
      }
      if (variety !== null) {
        const [active] = await manager.query(
          `SELECT variety_code FROM md_product_varieties WHERE variety_code=$1 AND status='ACTIVE'
            AND (effective_date IS NULL OR effective_date<=CURRENT_DATE)
            AND (expire_date IS NULL OR expire_date>=CURRENT_DATE) FOR SHARE`, [variety],
        );
        if (!active) throw new BadRequestException(`父产品品种 ${variety} 不存在、未启用或不在有效期内`);
      }
      if (!before || row.product_code !== before.product_code) {
        row.variety_code = variety;
        row.org_context_required = true;
      } else if (row.variety_code !== variety) throw new BadRequestException('SKU variety_code 与父产品不一致，禁止自动重分类');
      if (identityChanged) {
        row.product_name = product.product_name_zh || product.product_name || row.product_code;
        // Existing forms require a user name. Preserve explicit nonempty names; derive only when omitted.
        row.sku_name = dto.sku_name !== undefined ? row.sku_name : `${row.product_name} (${row.grade_code} / ${row.spec_code})`;
      }
    }
    if (dto.org_context_required !== undefined && dto.org_context_required !== row.org_context_required) {
      throw new BadRequestException('org_context_required 为内部派生组织限制，不可手工修改');
    }
    if (dto.variety_code !== undefined) {
      const suppliedVariety = dto.variety_code === '' ? null : dto.variety_code;
      if (suppliedVariety !== row.variety_code) throw new BadRequestException('variety_code 由父产品派生，不可手工修改');
    }
    if (dto.product_name != null && String(dto.product_name).trim() && dto.product_name !== row.product_name) throw new BadRequestException('product_name 由父产品自动带出，不可手工修改');
    if (typeof row.sku_name !== 'string' || !row.sku_name.trim()) throw new BadRequestException('sku_name 必填');
    for (const [field, max] of Object.entries({ product_code: 64, grade_code: 16, spec_code: 64, product_name: 256, sku_name: 256, sku_name_en: 255, sku_name_lo: 255 })) {
      if (row[field] != null && [...String(row[field])].length > max) throw new BadRequestException(`${field} 超过 ${max} 字符`);
    }
    const duplicate = await manager.query(
      `SELECT sku_code FROM product_skus WHERE product_code=$1 AND grade_code=$2 AND spec_code=$3 AND sku_code<>$4 LIMIT 1`,
      [row.product_code, row.grade_code, row.spec_code, before?.sku_code ?? ''],
    );
    if (duplicate.length) throw new ConflictException('产品/等级/规格组合已存在（含归档 SKU）');
    if (row.barcode) {
      // No schema change: serialize barcode claims from all domain writes before checking uniqueness.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('product_skus.barcode'), hashtext($1))`, [row.barcode]);
      const duplicates = await manager.query('SELECT sku_code FROM product_skus WHERE barcode=$1 AND sku_code<>$2 LIMIT 1', [row.barcode, before?.sku_code ?? '']);
      if (duplicates.length) throw new ConflictException('条码已被其他 SKU 使用（含归档 SKU）');
    }
    return row;
  }

  private async transaction<T>(run: (manager: EntityManager) => Promise<T>): Promise<T> {
    try { return await this.ds.transaction(run); }
    catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('SKU 编码、产品/等级/规格组合或条码冲突');
      throw error;
    }
  }

  async create(dto: Row, operator?: string): Promise<Row> {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new BadRequestException('SKU 请求必须为对象');
    if (dto.sku_code !== undefined) throw new BadRequestException('SKU 编码由系统自动生成；新增时请省略 sku_code');
    if (dto.status !== undefined && dto.status !== 'ACTIVE') throw new BadRequestException('新建 SKU 状态只能为 ACTIVE；后续请使用生命周期接口');
    return this.transaction(async manager => {
      const row = await SkuWriter.prepare(manager, dto);
      let code: string;
      try { code = await this.codes.next('SKU', manager); }
      catch (error) {
        if (String((error as Error).message).includes('编码前缀未注册')) throw new BadRequestException('SKU 编码前缀未注册，请先配置主数据编码序列');
        throw error;
      }
      const saved = await SkuWriter.insert(manager, row, code);
      await this.audit.logInTransaction(manager, { objectType: 'SKU', objectCode: code, action: 'CREATE', after: saved, operator: operator ?? 'AUTO' });
      return saved;
    });
  }

  private static async insert(manager: Pick<EntityManager, 'query'>, row: Row, code: string): Promise<Row> {
    const fields = ['sku_code', 'status', 'product_name', ...INTERNAL_DERIVED, ...WRITABLE.filter(field => row[field] !== undefined)];
    const values = fields.map(field => field === 'sku_code' ? code : field === 'status' ? 'ACTIVE' : row[field]);
    const [saved] = this.rows(await manager.query(
      `INSERT INTO product_skus (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, values,
    ));
    return saved;
  }

  /** Internal reviewed import only. Preserve the approved source code/name and caller transaction. */
  static async createApproved(manager: Pick<EntityManager, 'query'>, dto: Row, approvedCode: string, approvedName: string, operator: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(approvedCode) || !approvedName?.trim() || [...approvedName].length > 256) throw new BadRequestException('已审核 SKU 编码/名称不合法');
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('product_skus.approved_code'), hashtext($1))`, [approvedCode]);
    const [existing] = await manager.query('SELECT * FROM product_skus WHERE sku_code=$1 FOR UPDATE', [approvedCode]);
    if (existing) {
      if (SKU_IDENTITY_FIELDS.some(field => existing[field] !== dto[field]) || existing.sku_name !== approvedName || existing.status !== 'ACTIVE') throw new ConflictException('已审核 SKU 编码对应的现有身份、名称或状态不一致');
      // Idempotency must not bless historical NULL/mismatched classification or silently repair it.
      await this.prepare(manager, { variety_code: dto.variety_code, org_context_required: dto.org_context_required }, existing, true);
      return false;
    }
    const row = await this.prepare(manager, dto);
    // The approved source name is an explicit import contract, not a public naming override.
    row.sku_name = approvedName;
    try {
      const saved = await this.insert(manager, row, approvedCode);
      await MasterDataAuditService.writeInTransaction(manager, { objectType: 'SKU', objectCode: approvedCode, action: 'CREATE', after: saved, operator, reason: '已审核好业财候选；保留来源编码/名称，仅 ERP 建档' });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('已审核 SKU 与现有编码或产品/等级/规格组合冲突');
      throw error;
    }
  }

  async update(code: string, dto: Row, operator?: string): Promise<Row> {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new BadRequestException('SKU 请求必须为对象');
    return this.transaction(async manager => {
      const before = await SkuPolicy.lockForUpdate(manager, code);
      if (dto.status !== undefined && dto.status !== before.status) throw new BadRequestException('状态变更请使用主数据生命周期接口');
      if (dto.sku_code !== undefined && dto.sku_code !== code) throw new BadRequestException('SKU 编码不可修改');
      const row = await SkuWriter.prepare(manager, dto, before);
      const changes = Object.fromEntries([...WRITABLE, ...INTERNAL_DERIVED, 'product_name'].filter(field => {
        if (field === 'effective_date' || field === 'expire_date') return SkuWriter.date(row[field], field) !== SkuWriter.date(before[field], field);
        return row[field] !== before[field];
      }).map(field => [field, row[field]]));
      await SkuPolicy.assertIdentityChange(manager, before, { ...changes, ...(dto.sku_code !== undefined ? { sku_code: dto.sku_code } : {}) });
      const fields = Object.keys(changes);
      if (!fields.length) return before;
      const [saved] = SkuWriter.rows(await manager.query(
        `UPDATE product_skus SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')},updated_at=NOW() WHERE sku_code=$${fields.length + 1} RETURNING *`,
        [...Object.values(changes), code],
      ));
      await this.audit.logInTransaction(manager, { objectType: 'SKU', objectCode: code, action: 'UPDATE', before, after: saved, operator: operator ?? 'AUTO' });
      return saved;
    });
  }

  async transition(code: string, action: string, operator?: string, reason?: string): Promise<{ status: string }> {
    const rules: Record<string, { from: string[]; to: string; audit: MdAction }> = {
      submit: { from: ['DRAFT', 'REJECTED'], to: 'ACTIVE', audit: 'UPDATE' },
      approve: { from: ['PENDING_APPROVAL'], to: 'ACTIVE', audit: 'UPDATE' },
      reject: { from: ['PENDING_APPROVAL'], to: 'REJECTED', audit: 'UPDATE' },
      freeze: { from: ['ACTIVE'], to: 'FROZEN', audit: 'FREEZE' },
      archive: { from: ['DRAFT', 'REJECTED', 'ACTIVE', 'FROZEN'], to: 'ARCHIVED', audit: 'ARCHIVE' },
      restore: { from: ['FROZEN', 'ARCHIVED'], to: 'ACTIVE', audit: 'RESTORE' },
    };
    return this.transaction(async manager => {
      const before = await SkuPolicy.lockForUpdate(manager, code);
      const rule = rules[action];
      if (!rule || !rule.from.includes(before.status)) throw new BadRequestException(`当前状态 ${before.status} 不允许执行 ${action}`);
      if (rule.to === 'ACTIVE') await SkuWriter.prepare(manager, {}, before, true);
      if (action === 'archive') await SkuPolicy.assertUnreferenced(manager, before);
      await manager.query('UPDATE product_skus SET status=$1,updated_at=NOW() WHERE sku_code=$2', [rule.to, code]);
      await this.audit.logInTransaction(manager, { objectType: 'SKU', objectCode: code, action: rule.audit, before: { status: before.status }, after: { status: rule.to }, operator: operator ?? 'AUTO', reason });
      return { status: rule.to };
    });
  }
}
