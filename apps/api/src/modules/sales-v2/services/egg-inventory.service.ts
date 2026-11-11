import { savedQuantity, QuantitySnapshot, positiveQuantity, baseQuantity, sharedBatches, lockQuantityPools, assertBatchPool, resolveQuantity } from '../../product-master/services/quantity-contract';
import { SkuPolicy } from '../../product-master/services/sku-policy';
import { EggSourceProfile, SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import {
  Injectable, Logger, BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';

/**
 * EggInventoryService — Sales V2 Phase 7 + Phase H4
 *
 * 鸡蛋时效库存 Runtime。
 *
 * 核心设计原则：
 *   · FIFO（先进先出）：按 expire_date ASC 扣减，Runtime 强制
 *   · 临期控制：expire_date - CURRENT_DATE <= 7 天 → 预警
 *   · 过期禁售：expire_date < CURRENT_DATE → 禁止分配
 *   · 退货重检：RETURNED 批次不可直接再销售
 *   · qty_available 不允许负数（Advisory Lock 防并发）
 *   · 所有变动写 inv_ledger（完整审计链）
 *
 * Phase H4 新增：
 *   · 批次支持 sku_code / grade_code_std / spec_code（均可选，向后兼容）
 *   · FIFO 分配支持 PATH A（sku_code 精确匹配）+ PATH B（旧 product+grade 兼容）
 *   · writeLedger 增加 sku_code 传递，支持 SKU 维度流水追溯
 *   · createProductionBatch 支持 skuCode 参数，自动推导等级/规格
 *
 * 批次号规则：
 *   生产批次：  EGG-YYYYMMDD-NNNNN
 *   退货批次：  RET-{returnNo}-{productCode}（由 ReturnOrdersService 生成）
 *
 * change_type 枚举（inv_ledger）：
 *   INBOUND        — 入库（WMS 原有）
 *   OUTBOUND       — 出库（WMS 原有）
 *   SALE_RETURN    — 退货回库（Phase 6）
 *   WRITE_OFF      — 损耗（Phase 6）
 *   FIFO_OUT       — FIFO 出库预占（Phase 7）
 *   RESERVED       — 订单审批时库存预留（Phase 7）
 *   RELEASED       — 订单取消时释放预留（Phase 7）
 *   QC_REJECT      — 质检不合格（Phase 7）
 *   EXPIRE_WRITEOFF — 过期报废（Phase 7）
 *   DAMAGE_WRITEOFF — 破损报废（Phase 7）
 */

export interface EggBatch {
  id: number;
  batch_no: string;
  product_code: string;
  company_code: string;
  warehouse_code: string | null;
  egg_date: string | null;
  expire_date: string | null;
  quality_grade: string | null;
  packaging_spec: string | null;
  source_type: string | null;
  source_no: string | null;
  qty: number;
  qty_available: number;
  status: string;
  created_at: string;
  /** Phase H4: 关联 product_skus.sku_code（可选） */
  sku_code: string | null;
  /** Phase H4: 标准等级编码（product_grades.grade_code，与旧 quality_grade 并存） */
  grade_code_std: string | null;
  /** Phase H4: 标准规格编码（packaging_specs.spec_code，与旧 packaging_spec 并存） */
  spec_code: string | null;
  /** 阶段3: 品种快照（md_product_varieties.variety_code），历史批次 NULL */
  variety_code: string | null;
  source_profile_code?: string | null;
  source_profile_snapshot?: Array<{ profileCode: string; houseCode: string; productMode: 'STANDARD' | 'VARIANT'; varietyCode: string | null; effectiveDate: string }> | null;
  sku_name?: string | null;
  sku_name_en?: string | null;
  sku_name_lo?: string | null;
  product_name?: string | null;
  product_name_zh?: string | null;
  product_name_en?: string | null;
  product_name_lo?: string | null;
  company_name?: string | null;
  company_name_zh?: string | null;
  warehouse_name?: string | null;
  warehouse_name_zh?: string | null;
  warehouse_name_en?: string | null;
  warehouse_name_lo?: string | null;
  location_name?: string | null;
}

export interface FifoAllocation {
  batchNo:       string;
  allocatedQty:  number;
  expireDate:    string | null;
  qualityGrade:  string | null;
  remaining:     number;   // 未满足的数量（正常为 0）
  /** Phase H4 */
  skuCode:       string | null;
  reservationLedgerId: number;
}

/** 默认保质期：30 天 */
const DEFAULT_SHELF_DAYS = 30;
/** 临期预警阈值：7 天 */
const EXPIRING_WARN_DAYS = 7;

/** Validate before deriving the shared date namespace or writing inventory. */
export function assertEggDate(value: string): void {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
    || value.startsWith('0000-') || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('eggDate 必须是有效的 YYYY-MM-DD 日期');
  }
}

@Injectable()
export class EggInventoryService {
  private readonly logger = new Logger(EggInventoryService.name);

  /** 等级缓存：5 分钟 TTL，运维改 product_grades 后 ≤5min 生效 */
  private _gradeCache: { codes: string[]; expireAt: number } = { codes: [], expireAt: 0 };

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly skuAvailability: SkuAvailabilityService = new SkuAvailabilityService(ds),
  ) {}

  /** 销售鸡蛋库存的产品族；EGG 是页面使用的族别名，不是精确产品码。 */
  private eggFamilyCondition(alias = 'b'): string {
    return `(${alias}.product_code = 'EGG' OR ${alias}.product_code LIKE 'PRD-EGG-%')`;
  }

  /** 统一页面查询的公司范围；null 表示全局，[] 表示拒绝访问。 */
  private companyScope(requested?: string): string[] | null {
    const scope = this.cls.get('dataScope');
    if (!scope || scope.isGlobal) return requested ? [requested] : null;
    const allowed = scope.allowedCompanyCodes ?? [];
    if (requested) return allowed.includes(requested) ? [requested] : [];
    return allowed;
  }

  // ── 内部工具 ─────────────────────────────────────────────────────────────────

  /**
   * 从 product_grades 主数据动态读取合法等级集合（带 5min 缓存）。
   * 兼容历史：若旧批次写入了 0-5 数字蛋档（P1A 临时生产入库遗留），
   * 这些值已不在 product_grades 中 → 新写入会被拦截，旧批次读取不受影响。
   */
  private async getValidGrades(mgr?: EntityManager): Promise<string[]> {
    const now = Date.now();
    if (this._gradeCache.codes.length > 0 && this._gradeCache.expireAt > now) {
      return this._gradeCache.codes;
    }
    try {
      const rows: Array<{ grade_code: string }> = await (mgr ?? this.ds).query(
        `SELECT grade_code FROM product_grades WHERE status='ACTIVE' ORDER BY sort_order`,
      );
      const codes = rows.map(r => r.grade_code).filter(Boolean);
      if (codes.length > 0) {
        this._gradeCache = { codes, expireAt: now + 5 * 60 * 1000 };
        return codes;
      }
    } catch (e) {
      this.logger.warn(`getValidGrades fallback to defaults: ${(e as Error).message}`);
    }
    // 兜底（product_grades 表不可用 / CI 测试库）：孟赛业务尺寸档 + 异常档
    return ['XL', 'L', 'M', 'S', 'XS', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];
  }

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'system'; } catch { return 'system'; }
  }

  private async genBatchNo(eggDate: string, mgr: EntityManager): Promise<string> {
    const prefix = `EGG-${eggDate.replace(/-/g, '')}-`;
    // All automatic producers share this namespace, across sources and companies.
    // Two-int advisory locks are separate from the user-controlled one-bigint source locks.
    await mgr.query(
      "SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-batch-number'), hashtext($1))", [prefix],
    );
    const [row] = await mgr.query(
      `SELECT MAX(substring(batch_no FROM $2)::numeric) AS max_suffix
         FROM inv_batches WHERE batch_no LIKE $1 AND batch_no ~ $2`,
      [`${prefix}%`, `^${prefix}([0-9]+)$`],
    );
    const batchNo = `${prefix}${String(BigInt(row.max_suffix ?? '0') + 1n).padStart(5, '0')}`;
    if (batchNo.length > 64) throw new BadRequestException('当日生产批号已超出允许范围，请核对库存');
    return batchNo;
  }

  private calcExpireDate(eggDate: string, shelfDays = DEFAULT_SHELF_DAYS): string {
    const d = new Date(eggDate);
    d.setDate(d.getDate() + shelfDays);
    return d.toISOString().slice(0, 10);
  }

  /**
   * 写 inv_ledger 流水（内部）
   * Phase H4：新增 skuCode 传递，支持按 SKU 维度追溯
   */
  private async writeLedger(
    params: {
      batchNo:         string;
      changeType:      string;
      qtyChange:       number;
      operator:        string;
      companyCode:     string;
      refNo:           string;
      note:            string;
      batchExpireDate?: string | null;
      qualityGrade?:   string | null;
      /** Phase H4: 从批次传递 sku_code，写入 inv_ledger 便于追溯 */
      skuCode?:        string | null;
      logDate?:        string | null;
      warehouseCode?:  string | null;
      locationCode?:   string | null;
    },
    mgr?: EntityManager,
  ) {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);
    const [ledger] = await q(
      `INSERT INTO inv_ledger
         (batch_no, change_type, qty_change, operator, store_code, ref_no, note,
          batch_expire_date, quality_grade, company_code, sku_code,
          log_date, warehouse_code, location_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        params.batchNo,
        params.changeType,
        params.qtyChange,
        params.operator,
        params.companyCode,
        params.refNo,
        params.note,
        params.batchExpireDate ?? null,
        params.qualityGrade ?? null,
        params.companyCode,
        params.skuCode ?? null,
        params.logDate ?? null,
        params.warehouseCode ?? null,
        params.locationCode ?? null,
      ],
    );
    // Query mocks used by SQL-contract unit tests return no row; PostgreSQL always
    // returns the persisted id and the allocation FK makes a missing real id fail closed.
    return Number(ledger?.id ?? 0);
  }

  /**
   * Phase H4: 根据 sku_code 查询 product_skus，返回推导信息
   * 仅在 skuCode 参数存在时调用
   */
  private async resolveSkuInfo(skuCode: string, mgr?: EntityManager, companyCode?: string): Promise<{
    productCode: string;
    gradeCode:   string;
    specCode:    string;
    varietyCode: string | null;
  }> {
    if (!mgr) throw new Error('SKU 校验需要库存写入事务');
    const sku = await SkuPolicy.requireUsable(mgr, skuCode, 'stock', companyCode);
    return { productCode: sku.product_code, gradeCode: sku.grade_code, specCode: sku.spec_code, varietyCode: sku.variety_code };
  }

  // ── 1. 创建生产批次 ──────────────────────────────────────────────────────────

  /**
   * 创建生产批次
   *
   * Phase H4 新增参数：skuCode（可选）
   * - 传入 skuCode 时：自动校验 SKU 存在性，从 product_skus 推导 productCode/grade/spec
   * - 未传 skuCode 时：仅明确无品种的旧 PRODUCTION 使用 productCode + qualityGrade + packagingSpec
   * - 有品种主档必须显式传入一致品种，并在同一事务验证公司 scope/stock 用途；快照只取验证主档
   */
  async createProductionBatch(params: {
    companyCode:    string;
    warehouseCode?: string;
    locationCode?: string;
    eggDate:        string;
    qualityGrade?:  string;
    packagingSpec?: string;
    productCode:    string;
    qty:            number;
    shelfDays?:     number;
    sourceNo?:      string;
    /** Phase H4: 优先使用 SKU 填充产品/等级/规格 */
    skuCode?:       string;
    gradeCodeStd?:  string;
    specCode?:      string;
    /** Must agree with the DB source profile; STANDARD has an explicit NULL snapshot. */
    varietyCode?:   string | null;
    sourceProfileCode?: string;
    houseCode?: string;
    farmCode?: string;
    siteCode?: string;
    /** Multi-house packaging retains every source; all must share mode/variety. */
    sourceProfileRefs?: Array<{ profileCode: string; houseCode: string }>;
    /** 生产链路收口 Phase 1：来源类型（默认 PRODUCTION，包装入库传 PACKAGING） */
    sourceType?:    string;
    /** 生产链路收口 Phase 1：inv_ledger 变动类型（默认 INBOUND，包装入库传 PACKAGING_INBOUND） */
    ledgerChangeType?: string;
    /** 生产链路收口 Phase 1：包装批次追溯引用（pkg_tasks.task_no） */
    packagingBatchRef?:  string;
    /** 生产链路收口 Phase 1：集蛋批次追溯引用 */
    collectionBatchRef?: string;
  }, mgr?: EntityManager): Promise<EggBatch> {
    assertEggDate(params.eggDate);
    positiveQuantity(params.qty, '入库数量');
    if (params.sourceType === 'TEMP_PRODUCTION' && (!params.warehouseCode || !params.locationCode)) {
      throw new BadRequestException('日产蛋入库必须解析到真实 ACTIVE 仓库和库位，禁止使用默认占位码');
    }
    const hasSource = params.sourceProfileRefs !== undefined || params.sourceProfileCode !== undefined || params.houseCode !== undefined;
    if (hasSource && (typeof params.warehouseCode !== 'string' || !params.warehouseCode.trim()
        || params.warehouseCode !== params.warehouseCode.trim() || typeof params.locationCode !== 'string'
        || !params.locationCode.trim() || params.locationCode !== params.locationCode.trim())) {
      throw new BadRequestException('来源档案批次必须显式提供真实 ACTIVE 仓库和库位，禁止使用默认占位码');
    }
    if (hasSource) {
      const scope: unknown = this.cls.get('dataScope');
      if (scope != null) {
        const valid = typeof scope === 'object' && !Array.isArray(scope)
          ? scope as { isGlobal?: unknown; allowedCompanyCodes?: unknown; allowedWarehouseCodes?: unknown } : undefined;
        if (!valid || typeof valid.isGlobal !== 'boolean') throw new ForbiddenException('来源批次 dataScope 格式无效');
        if (!valid.isGlobal && (!Array.isArray(valid.allowedCompanyCodes) || !Array.isArray(valid.allowedWarehouseCodes)
            || valid.allowedCompanyCodes.some(code => typeof code !== 'string' || !code.trim())
            || valid.allowedWarehouseCodes.some(code => typeof code !== 'string' || !code.trim())
            || !valid.allowedCompanyCodes.includes(params.companyCode) || !valid.allowedWarehouseCodes.includes(params.warehouseCode))) {
          throw new ForbiddenException('无权向指定公司或仓库创建来源批次');
        }
      }
    }
    if ((params.sourceType === 'TEMP_PRODUCTION' || params.sourceType === 'PACKAGING') && (!params.skuCode || !hasSource)) {
      throw new BadRequestException('新生产/包装入库必须显式提供已由来源确认的 SKU 和 source profile，禁止回退旧生产通道');
    }

    // Keep allocation, batch and ledger atomic even for callers without an existing transaction.
    if (!mgr) return this.ds.transaction(tx => this.createProductionBatch(params, tx));

    const profiles: EggSourceProfile[] = [];
    if (hasSource) {
      // A valid house/profile does not authorize an unrelated destination. Keep
      // these authority locks in the same transaction as the stock/ledger write.
      const warehouses = await mgr.query(
        `SELECT warehouse_code, company_code, status FROM wms_warehouses
          WHERE warehouse_code = $1 FOR SHARE`, [params.warehouseCode],
      );
      if (warehouses.length !== 1 || warehouses[0].warehouse_code !== params.warehouseCode
          || warehouses[0].status !== 'ACTIVE' || warehouses[0].company_code !== params.companyCode) {
        throw new BadRequestException('来源批次仓库必须为指定公司的真实 ACTIVE 仓库');
      }
      const locations = await mgr.query(
        `SELECT location_code, warehouse_code, status FROM wms_locations
          WHERE location_code = $1 AND warehouse_code = $2 FOR SHARE`, [params.locationCode, params.warehouseCode],
      );
      if (locations.length !== 1 || locations[0].location_code !== params.locationCode
          || locations[0].warehouse_code !== params.warehouseCode || !['ACTIVE', 'NORMAL'].includes(locations[0].status)) {
        throw new BadRequestException('来源批次库位必须属于指定仓库且为 ACTIVE/NORMAL');
      }
      if (!params.skuCode) throw new BadRequestException('来源档案生产必须选择 SKU');
      const refs = params.sourceProfileRefs ?? [{ profileCode: params.sourceProfileCode!, houseCode: params.houseCode! }];
      if (!Array.isArray(refs) || !refs.length || refs.some(ref => !ref || typeof ref.profileCode !== 'string'
          || !ref.profileCode.trim() || typeof ref.houseCode !== 'string' || !ref.houseCode.trim())
          || new Set(refs.map(ref => ref.houseCode)).size !== refs.length
          || new Set(refs.map(ref => ref.profileCode)).size !== refs.length) {
        throw new BadRequestException('来源档案 refs 必须完整、非空且不得重复 house/profile');
      }
      if (params.sourceProfileRefs !== undefined && (params.sourceProfileCode !== undefined || params.houseCode !== undefined)
          && (refs.length !== 1 || refs[0].profileCode !== params.sourceProfileCode || refs[0].houseCode !== params.houseCode)) {
        throw new BadRequestException('来源档案 refs 与单一来源参数不一致');
      }
      // Stable lock ordering for multi-house packaging, with no first-source shortcut.
      for (const ref of [...refs].sort((a, b) => a.houseCode.localeCompare(b.houseCode))) {
        profiles.push(await this.skuAvailability.resolveSourceProfile({
          companyCode: params.companyCode, houseCode: ref.houseCode, eggDate: params.eggDate,
          sourceProfileCode: ref.profileCode, farmCode: params.farmCode, siteCode: params.siteCode,
        }, mgr));
      }
      if (profiles.some(profile => profile.productMode !== profiles[0].productMode || profile.varietyCode !== profiles[0].varietyCode)) {
        throw new BadRequestException('多个来源档案 productMode/variety 不一致，禁止合并库存');
      }
    }

    // Phase H4 PATH A: 传入 sku_code → 校验并自动推导字段
    let productCode  = params.productCode;
    let gradeCodeStd = params.gradeCodeStd ?? null;
    let specCode     = params.specCode     ?? null;
    let skuCode      = params.skuCode      ?? null;
    let skuVariety: string | null | undefined;
    let varietyCode: string | null = null;

    if (params.skuCode !== undefined) {
      const skuInfo = await this.resolveSkuInfo(params.skuCode!, mgr, params.companyCode);
      productCode  = skuInfo.productCode;
      gradeCodeStd = skuInfo.gradeCode;
      specCode     = skuInfo.specCode;
      skuVariety   = skuInfo.varietyCode;
      // 兼容写旧字段：quality_grade 对齐标准等级，packaging_spec 对齐标准规格编码
      params = {
        ...params,
        productCode,
        qualityGrade: skuInfo.gradeCode,
        packagingSpec: skuInfo.specCode,
      };
    }

    // 质量等级校验（2026-06-06 收口）：从 product_grades 权威源动态读取，弃用
    // 硬编码 14 档混杂表（含历史遗留 0-5 数字蛋档）。带 5 分钟模块级缓存。
    const validGrades = await this.getValidGrades(mgr);
    // 默认 'L'（一号蛋）— 孟赛主流销售档；非孟赛业务建议显式传 qualityGrade
    const grade = params.qualityGrade ?? 'L';
    if (!validGrades.includes(grade)) {
      throw new BadRequestException(`无效的质量等级: ${grade}，有效值：${validGrades.join('/')}`);
    }

    const batchNo    = await this.genBatchNo(params.eggDate, mgr);
    const expireDate = this.calcExpireDate(params.eggDate, params.shelfDays ?? DEFAULT_SHELF_DAYS);
    const [product] = await mgr.query('SELECT unit,unit_zh,status,variety_code FROM mst_products WHERE product_code=$1 FOR SHARE', [productCode]);
    const unit = product?.unit_zh || product?.unit;
    if (!unit || product.status!=='ACTIVE') throw new BadRequestException('产品未启用或基本单位不明确，禁止创建库存');
    if (product.variety_code === undefined || (skuCode && skuVariety === undefined)) {
      throw new BadRequestException('产品/SKU 品种主档不明确，禁止创建库存');
    }
    if (skuCode && skuVariety !== product.variety_code) {
      throw new BadRequestException('SKU 与产品品种不一致，禁止创建库存');
    }
    if (profiles.length) {
      const profile = profiles[0];
      if (product.variety_code !== profile.varietyCode || skuVariety !== profile.varietyCode) {
        throw new BadRequestException('SKU/产品品种与来源档案 productMode/variety 不一致');
      }
      if ((profile.productMode === 'VARIANT' && (!params.varietyCode || params.varietyCode !== profile.varietyCode))
          || (profile.productMode === 'STANDARD' && params.varietyCode != null)) {
        throw new BadRequestException('必须显式提供与来源档案一致的品种；STANDARD 必须为空');
      }
      for (const source of profiles) {
        const available = await this.skuAvailability.assertUsable(skuCode!, {
          companyCode: params.companyCode, eggDate: params.eggDate, varietyCode: source.varietyCode,
          houseCode: source.houseCode, sourceProfileCode: source.profileCode,
          farmCode: source.farmCode, siteCode: source.siteCode, usage: 'stock',
        }, mgr);
        if (available.productCode !== productCode || available.varietyCode !== source.varietyCode) {
          throw new BadRequestException('已验证 SKU/产品品种发生不一致，禁止创建库存');
        }
      }
      varietyCode = profile.varietyCode;
    } else {
      if (product.variety_code !== null) {
        if (!skuCode) throw new BadRequestException('有品种的产品必须选择 SKU，禁止走旧生产通道');
        throw new BadRequestException('有品种的生产必须显式提供 source profile 和 houseCode，禁止推测来源');
      }
      // Only explicitly NULL product/SKU historical production remains compatible.
      if (params.varietyCode != null || (params.sourceType !== undefined && params.sourceType !== 'PRODUCTION')) {
        throw new BadRequestException('无品种历史产品不得写入品种快照或冒用新品种生产通道');
      }
      // This exception is only for unconfigured legacy companies. Once source
      // policy has been configured, disabling all its rows must not reopen this
      // historical exception as a fail-open production path.
      const configured = await mgr.query(
        `SELECT profile_code FROM md_egg_source_profiles
          WHERE company_code = $1 FOR SHARE`, [params.companyCode],
      );
      if (configured.length) throw new BadRequestException('公司已启用来源档案，禁止无来源的历史 PRODUCTION 新建通道');
    }
    if (skuCode) await resolveQuantity(mgr,{qty:params.qty,skuCode,quantityBasis:'BASE'});
    const qty = baseQuantity(params.qty, 1, unit);
    if (gradeCodeStd && gradeCodeStd!==grade) throw new BadRequestException('批次标准等级与生产质量等级不一致');
    gradeCodeStd = grade;

    // Phase H4: INSERT 增加三个 SKU 字段
    // 生产链路收口 Phase 1: source_type 参数化 + 追溯引用列
    const sourceType = params.sourceType ?? 'PRODUCTION';
    const [batch] = await (mgr ?? this.ds).query(
      `INSERT INTO inv_batches (
         batch_no, product_code, company_code, warehouse_code, location_code,
         egg_date, inbound_date, expire_date, quality_grade, packaging_spec,
         source_type, source_no,
         qty, qty_available, status,
         sku_code, grade_code_std, spec_code, variety_code, source_profile_code, source_profile_snapshot,
         packaging_batch_ref, collection_batch_ref, unit, base_quantity_version,
         created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,
         $12,'AVAILABLE',
         $13,$14,$15,$19,$20,$21::jsonb,
         $16,$17,$18,1,
         NOW(),NOW()
       ) RETURNING *`,
      [
        batchNo, productCode, params.companyCode,
        params.warehouseCode ?? 'WMS-VTE-MAIN', params.locationCode ?? 'INBOUND-DOCK',
        params.eggDate, expireDate, grade,
        params.packagingSpec ?? null,
        sourceType,
        params.sourceNo ?? null,
        qty,
        skuCode,
        gradeCodeStd,
        specCode,
        params.packagingBatchRef ?? null,
        params.collectionBatchRef ?? null,
        unit,
        varietyCode,
        profiles.length === 1 ? profiles[0].profileCode : null,
        profiles.length ? JSON.stringify(profiles.map(profile => ({
          profileCode: profile.profileCode, houseCode: profile.houseCode, productMode: profile.productMode,
          varietyCode: profile.varietyCode, effectiveDate: profile.effectiveDate,
        }))) : null,
      ],
    );

    await this.writeLedger({
      batchNo,
      changeType:  params.ledgerChangeType ?? 'INBOUND',
      qtyChange:   qty,
      operator:    this.operator,
      companyCode: params.companyCode,
      refNo:       params.sourceNo ?? batchNo,
      note:        `${sourceType === 'PACKAGING' ? '包装入库' : '生产入库'} product=${productCode} grade=${grade}${skuCode ? ` sku=${skuCode}` : ''} qty=${qty} expire=${expireDate}${params.packagingBatchRef ? ` pkg=${params.packagingBatchRef}` : ''}`,
      batchExpireDate: expireDate,
      qualityGrade:    grade,
      skuCode,
      logDate:         params.eggDate,
      warehouseCode:   params.warehouseCode ?? 'WMS-VTE-MAIN',
      locationCode:    params.locationCode ?? 'INBOUND-DOCK',
    }, mgr);

    this.logger.log(`[EggInv] 生产入库: ${batchNo} qty=${qty} expire=${expireDate}${skuCode ? ` sku=${skuCode}` : ''}`);
    return batch as EggBatch;
  }

  // ── 2. 查询可销售批次（展示按生产日期倒序；分配 FIFO 见下方） ────────────────────────────────

  /**
   * Phase H4: 新增 skuCode 参数（可选）
   * - 传入 skuCode 时：只返回该 SKU 的批次（PATH A）
   * - 未传时：按 productCode + gradeCode 过滤（PATH B，旧逻辑）
   */
  async getAvailableBatches(params: {
    productCode?:       string;
    companyCode?:       string;
    gradeCode?:         string;
    includingExpiring?: boolean;
    /** Phase H4: 按 SKU 精确过滤（优先于 productCode + gradeCode） */
    skuCode?:           string;
  }): Promise<EggBatch[]> {
    const conds: string[] = [`b.status = 'AVAILABLE'`, `b.qty_available > 0`];
    const args: unknown[] = [];
    let pi = 1;

    if (params.skuCode) {
      // Phase H4 PATH A: SKU 精确匹配
      conds.push(`b.sku_code = $${pi++}`);
      args.push(params.skuCode);
    } else {
      // PATH B: 旧逻辑（product+grade 匹配，向后兼容）
      if (params.productCode === 'EGG') {
        conds.push(this.eggFamilyCondition());
      } else if (params.productCode) {
        conds.push(`b.product_code = $${pi++}`);
        args.push(params.productCode);
      }
      if (params.gradeCode)   { conds.push(`b.quality_grade = $${pi++}`); args.push(params.gradeCode); }
    }

    const companyCodes = this.companyScope(params.companyCode);
    if (companyCodes?.length === 0) return [];
    if (companyCodes) {
      conds.push(`b.company_code = ANY($${pi++})`);
      args.push(companyCodes);
    }

    // 过期禁售
    if (!params.includingExpiring) {
      conds.push(`(b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)`);
    }

    const rows = await this.ds.query(
      `SELECT b.*,
              sku.sku_name, sku.sku_name_en, sku.sku_name_lo,
              COALESCE(p.product_name_zh, sku.sku_name, b.product_code) AS product_name,
              COALESCE(p.product_name_zh, sku.sku_name, b.product_code) AS product_name_zh,
              COALESCE(p.product_name_en, sku.sku_name_en, p.product_name_zh, sku.sku_name, b.product_code) AS product_name_en,
              COALESCE(p.product_name_lo, sku.sku_name_lo, p.product_name_zh, sku.sku_name, b.product_code) AS product_name_lo,
              company.company_name, company.company_name_zh,
              wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
              loc.location_name,
         CASE WHEN b.expire_date IS NULL THEN NULL
              ELSE (b.expire_date::date - CURRENT_DATE::date) END AS days_remaining
       FROM inv_batches b
       LEFT JOIN product_skus sku ON sku.sku_code = b.sku_code
       LEFT JOIN mst_products p ON p.product_code = b.product_code
       LEFT JOIN wms_warehouses wh ON wh.warehouse_code = b.warehouse_code
       LEFT JOIN wms_locations loc ON loc.location_code = b.location_code AND loc.warehouse_code = b.warehouse_code
       LEFT JOIN LATERAL (
         SELECT o.org_name AS company_name, o.org_name_cn AS company_name_zh
           FROM sys_organizations o
          WHERE o.org_type = 'COMPANY' AND COALESCE(o.company_code, o.org_code) = b.company_code
          ORDER BY o.org_code LIMIT 1
       ) company ON TRUE
       WHERE ${conds.join(' AND ')}
       ORDER BY b.egg_date DESC NULLS LAST, b.batch_no DESC, b.id DESC`,
      args,
    );
    return rows;
  }

  // ── 3. FIFO 分配（预占 qty_available） ──────────────────────────────────────

  /** Legacy sales must not acquire organization-managed stock, even via a saved batch. */
  private async isLegacySaleStock(skuCode: string | null | undefined, mgr: EntityManager): Promise<boolean> {
    if (skuCode == null) return true;
    const [sku] = await mgr.query(
      `SELECT * FROM product_skus WHERE sku_code=$1 FOR SHARE`, [skuCode],
    );
    // A missing mapping is not evidence of a historical, unmanaged SKU.
    return !!sku && sku.variety_code == null && sku.org_context_required !== true;
  }

  /**
   * Phase H4 升级：支持 skuCode 优先路径
   *
   * PATH A（sku_code 精确）：当 skuCode 参数存在时，只从该 SKU 批次中分配
   *   - Advisory Lock key: `fifo:${companyCode}:sku:${skuCode}`（更细粒度）
   *   - WHERE sku_code = $N
   *
   * PATH B（旧 product+grade）：回退逻辑，向后兼容旧批次
   *   - Advisory Lock key: `fifo:${companyCode}:${productCode}`（原有）
   *   - WHERE product_code = $1 [AND quality_grade = $N]
   *
   * 注意：PATH B 中 gradeCode 参数仍用 quality_grade 列（旧字段），不改 FIFO 逻辑
   */
  async allocateByFIFO(
    params: {
      productCode:  string;
      gradeCode?:   string;
      companyCode:  string;
      qty:          number;
      refNo:        string;
      note:         string;
      /** Phase H4: SKU 优先分配路径 */
      skuCode?:     string;
      fulfillmentWarehouseCode?: string;
      quantitySnapshot?: QuantitySnapshot | null;
    },
    mgr?: EntityManager,
  ): Promise<FifoAllocation[]> {
    if (!mgr) return this.ds.transaction(manager => this.allocateByFIFO(params, manager));
    const q = mgr.query.bind(mgr);
    if (params.skuCode !== undefined) await SkuPolicy.requireUsable(mgr, params.skuCode, 'sale-stock');
    else if (params.quantitySnapshot) await SkuPolicy.requireUsable(mgr, params.quantitySnapshot.skuCode, 'sale-stock');

    positiveQuantity(params.qty, '分配数量');

    // Advisory Lock 防并发超卖
    // Phase H4: SKU 路径用更细粒度的 lock key，旧路径继续用 productCode
    const lockKey = params.skuCode
      ? `fifo:${params.companyCode}:sku:${params.skuCode}`
      : `fifo:${params.companyCode}:${params.productCode}`;
    if (!params.quantitySnapshot) await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey]);

    // 构建批次查询条件
    // 生产链路收口 Phase 1：legacy_source IS NULL —— 销售只认 Sales V2 可售批次，
    //   排除闭环A(EGG-STOCK-*)/闭环B(PRD-EGG-*-PACK 中间态) 旧库存。
    const conds: string[] = [
      `company_code = $1`,
      `status = 'AVAILABLE'`,
      `qty_available > 0`,
      `(expire_date IS NULL OR expire_date >= CURRENT_DATE)`,
      `legacy_source IS NULL`,
      `(sku_code IS NULL OR EXISTS (
        SELECT 1 FROM "product_skus" legacy_sku
         WHERE legacy_sku.sku_code=inv_batches.sku_code
           AND legacy_sku.variety_code IS NULL
           AND legacy_sku.org_context_required=false
      ))`,
    ];
    const args: unknown[] = [params.companyCode];
    let pi = 2;

    if (params.skuCode) {
      // Phase H4 PATH A: sku_code 精确匹配（最高优先级）
      // H5 TODO: 当 sal_order_items 全面接入 sku_code 后，PATH B 可逐步移除
      conds.push(`sku_code = $${pi++}`);
      args.push(params.skuCode);
    } else {
      // PATH B: 旧 product+grade 匹配（向后兼容）
      conds.push(`product_code = $${pi++}`);
      args.push(params.productCode);
      if (params.gradeCode) {
        conds.push(`quality_grade = $${pi++}`);
        args.push(params.gradeCode);
      }
    }
    if (params.fulfillmentWarehouseCode) {
      conds.push(`warehouse_code = $${pi++}`);
      args.push(params.fulfillmentWarehouseCode);
    }

    const batches = params.quantitySnapshot
      ? await sharedBatches(mgr, params.companyCode, params.fulfillmentWarehouseCode ? [params.fulfillmentWarehouseCode] : [], params.quantitySnapshot)
      : await q(
      `SELECT * FROM inv_batches WHERE ${conds.join(' AND ')}
       ORDER BY expire_date ASC NULLS LAST, created_at ASC
       FOR UPDATE`,
      args,
    );

    // sharedBatches also serves stock-only flows, so apply the sales gate here,
    // under the same transaction's batch FOR UPDATE and SKU FOR SHARE locks.
    const legacyBatches: any[] = [];
    for (const batch of batches) {
      if (await this.isLegacySaleStock(batch.sku_code, mgr)) legacyBatches.push(batch);
    }
    const allocatableQty = legacyBatches.reduce((sum, batch) => sum + Number(batch.qty_available), 0);
    if (allocatableQty < params.qty) {
      const target = params.skuCode ? `sku=${params.skuCode}` : `product=${params.productCode} grade=${params.gradeCode ?? 'ALL'}`;
      throw new ConflictException(
        `库存不足：订单公司=${params.companyCode} ${target} `
        + `需求量=${params.qty} 该公司可分配量=${allocatableQty}`,
      );
    }

    let remaining = params.qty;
    const allocations: FifoAllocation[] = [];

    for (const batch of legacyBatches) {
      if (remaining <= 0) break;

      // Saved physical identity is authoritative, including a return's downgraded grade.
      if (!params.quantitySnapshot && batch.sku_code != null) await SkuPolicy.requireUsable(mgr, batch.sku_code, 'sale-stock');
      const canTake = Math.min(remaining, Number(batch.qty_available));
      remaining -= canTake;

      // 扣减 qty_available（预留）
      const changed = await q(
        `WITH changed AS (
           UPDATE inv_batches
              SET qty_available = qty_available - $1, updated_at=NOW()
            WHERE batch_no=$2
              AND company_code=$3
              AND warehouse_code=$4
              AND status='AVAILABLE'
              AND qty_available >= $1
              AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
              AND legacy_source IS NULL
            RETURNING batch_no
         ) SELECT batch_no FROM changed`,
        [canTake, batch.batch_no, params.companyCode, batch.warehouse_code],
      );
      if (changed.length !== 1) {
        throw new ConflictException(`批次 ${batch.batch_no} 状态、归属或可用量已变化`);
      }

      // 写 inv_ledger RESERVED（Phase H4: 传递 sku_code）
      const reservationLedgerId = await this.writeLedger({
        batchNo:         batch.batch_no,
        changeType:      'RESERVED',
        qtyChange:       -canTake,
        operator:        this.operator,
        companyCode:     params.companyCode,
        refNo:           params.refNo,
        note:            `FIFO 预占 ${params.note} batch=${batch.batch_no} qty=${canTake}${batch.sku_code ? ` sku=${batch.sku_code}` : ''}`,
        batchExpireDate: batch.expire_date,
        qualityGrade:    batch.quality_grade,
        skuCode:         batch.sku_code ?? null,
        warehouseCode: batch.warehouse_code, locationCode: batch.location_code,
      }, mgr);

      allocations.push({
        batchNo:      batch.batch_no,
        allocatedQty: canTake,
        expireDate:   batch.expire_date,
        qualityGrade: batch.quality_grade,
        remaining:    0,
        skuCode:      batch.sku_code ?? null,
        reservationLedgerId,
      });
    }

    if (remaining > 0) {
      // 库存不足：回滚已预占（抛出异常让事务回滚）
      const target = params.skuCode
        ? `sku=${params.skuCode}`
        : `product=${params.productCode} grade=${params.gradeCode ?? 'ALL'}`;
      const allocatableQty = params.qty - remaining;
      throw new ConflictException(
        `库存不足：订单公司=${params.companyCode} ${target} `
        + `需求量=${params.qty} 该公司可分配量=${allocatableQty}`,
      );
    }

    return allocations;
  }

  // ── 4. 预占库存（Sales Order APPROVED → FIFO 分配） ──────────────────────────

  async reserveInventory(
    orderId: string,
    orderNo: string,
    companyCode: string,
    mgr?: EntityManager,
    fulfillmentWarehouseCode?: string,
  ): Promise<boolean> {
    if (!mgr) return this.ds.transaction(manager => this.reserveInventory(orderId, orderNo, companyCode, manager, fulfillmentWarehouseCode));
    const q = mgr.query.bind(mgr);
    let createdAny = false;
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sales-order-reservation:${orderId}`]);

    const items = await q(
      `SELECT * FROM sal_order_items WHERE sales_order_id = $1`, [orderId],
    );

    await lockQuantityPools(mgr, items.map((item: any) => ({ company: companyCode, warehouses: fulfillmentWarehouseCode ? [fulfillmentWarehouseCode] : [], snapshot: item.quantity_snapshot })));
    for (const item of items.sort((a: any, b: any) => String(a.product_code).localeCompare(String(b.product_code)) || String(a.id).localeCompare(String(b.id)))) {
      const qty = savedQuantity(item);
      if (qty <= 0) continue;
      // Idempotent reservation must not bypass the explicit-SKU sales policy.
      if (item.sku_code != null) await SkuPolicy.requireUsable(mgr, item.sku_code, 'sale-stock');
      else if (item.quantity_snapshot) await SkuPolicy.requireUsable(mgr, item.quantity_snapshot.skuCode, 'sale-stock');

      const existing = await q(
        `SELECT a.id,a.batch_no,a.reserved_qty,a.outbound_qty,a.released_qty,b.sku_code
           FROM sal_order_item_batch_allocations a
           JOIN inv_batches b ON b.batch_no=a.batch_no
          WHERE a.sales_order_item_id=$1
          ORDER BY a.id FOR UPDATE OF a,b`,
        [item.id],
      );
      if (existing.length) {
        for (const allocation of existing) {
          if (!await this.isLegacySaleStock(allocation.sku_code, mgr)) {
            throw new ConflictException('旧销售预留禁止使用公司范围管理或未映射 SKU 库存');
          }
        }
        const reserved = existing.reduce((sum: number, row: any) => sum + Number(row.reserved_qty), 0);
        if (reserved !== qty) {
          throw new ConflictException(`订单明细 ${item.id} 已有分配 ${reserved}，与需求 ${qty} 不一致`);
        }
        continue;
      }

      const allocations = await this.allocateByFIFO({
          productCode: item.product_code,
          gradeCode:   item.grade_code ?? undefined,
          companyCode,
          qty,
          refNo:   orderNo,
          note:    `销售订单 ${orderNo} 明细 ${item.id}`,
          skuCode: item.sku_code ?? undefined,   // Phase H5: SKU PATH A 优先
          fulfillmentWarehouseCode,
          quantitySnapshot: item.quantity_snapshot,
      }, mgr);

        // 记录分配的批次（取首批次作为主批次，多批次逗号分隔）
        const batchNos     = allocations.map(a => a.batchNo).join(',');
      const allocatedQty = allocations.reduce((s, a) => s + a.allocatedQty, 0);

      for (const allocation of allocations) {
        await q(
          `INSERT INTO sal_order_item_batch_allocations
             (sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [item.id, allocation.batchNo, allocation.allocatedQty, allocation.reservationLedgerId, this.operator],
        );
        createdAny = true;
      }

      await q(
        `UPDATE sal_order_items
           SET allocated_batch_no=$1, allocated_qty=$2
           WHERE id=$3`,
          [batchNos, allocatedQty, item.id],
      );
    }

    this.logger.log(`[EggInv] 库存预占完成: order=${orderNo}`);
    return createdAny;
  }

  // ── 5. 释放库存（Sales Order CANCELLED → 还回 qty_available） ───────────────

  async releaseInventory(
    orderId: string,
    orderNo: string,
    companyCode: string,
    mgr?: EntityManager,
  ): Promise<void> {
    if (!mgr) return this.ds.transaction(manager => this.releaseInventory(orderId,orderNo,companyCode,manager));
    const q = mgr.query.bind(mgr);

    const allocations = await q(
      `SELECT a.*,oi.sales_order_id,b.sku_code,b.warehouse_code,b.status,b.qty,b.qty_available
         FROM sal_order_item_batch_allocations a
         JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
         JOIN inv_batches b ON b.batch_no=a.batch_no
        WHERE oi.sales_order_id=$1
        ORDER BY a.id FOR UPDATE OF a,b`,
      [orderId],
    );

    for (const allocation of allocations) {
      const releaseQty = Number(allocation.reserved_qty) - Number(allocation.outbound_qty) - Number(allocation.released_qty);
      if (releaseQty <= 0) continue;

        const changed = await q(
          `WITH changed AS (
             UPDATE inv_batches
                SET qty_available = qty_available + $1, updated_at=NOW()
              WHERE batch_no=$2
                AND company_code=$3
                AND warehouse_code=$4
                AND status='AVAILABLE'
                AND qty_available + $1 <= qty
              RETURNING batch_no
           ) SELECT batch_no FROM changed`,
          [releaseQty, allocation.batch_no, companyCode, allocation.warehouse_code],
        );
      if (changed.length !== 1) throw new ConflictException(`释放批次 ${allocation.batch_no} 状态、归属或数量已变化`);

      const ledgerId = await this.writeLedger({
          batchNo:     allocation.batch_no,
          changeType:  'RELEASED',
          qtyChange:   releaseQty,
          operator:    this.operator,
          companyCode,
          refNo:       orderNo,
          note:        `订单取消释放预占 order=${orderNo} allocation=${allocation.id} batch=${allocation.batch_no}`,
          skuCode:     allocation.sku_code ?? null,
        }, mgr);

      await q(
        `INSERT INTO sal_order_item_batch_allocation_actions
           (allocation_id,sales_order_id,action_type,action_key,qty,ledger_id,created_by)
         VALUES ($1,$2,'RELEASED',$3,$4,$5,$6)
        `,
        [allocation.id, orderId, `order-cancel:${orderId}`, releaseQty, ledgerId, this.operator],
      );
      const updated = await q(
        `WITH changed AS (
           UPDATE sal_order_item_batch_allocations
              SET released_qty=released_qty+$1,updated_at=NOW()
            WHERE id=$2 AND outbound_qty+released_qty+$1<=reserved_qty
            RETURNING id
         ) SELECT id FROM changed`,
        [releaseQty, allocation.id],
      );
      if (updated.length !== 1) throw new ConflictException(`释放 allocation ${allocation.id} 数量已变化`);
    }

    await q(`UPDATE sal_order_items SET allocated_batch_no=NULL,allocated_qty=0 WHERE sales_order_id=$1`, [orderId]);

    this.logger.log(`[EggInv] 库存释放完成: order=${orderNo}`);
  }

  // ── 6. 确认出库（Delivery LOADED → 正式扣减 qty） ────────────────────────────

  async confirmOutbound(
    orderId: string,
    orderNo: string,
    companyCode: string,
    deliveryNo: string,
    deliveryId: string,
    requestedQty: number,
    mgr?: EntityManager,
  ): Promise<number> {
    if (!mgr) return this.ds.transaction(manager => this.confirmOutbound(orderId, orderNo, companyCode, deliveryNo, deliveryId, requestedQty, manager));
    const q = mgr.query.bind(mgr);
    positiveQuantity(requestedQty,'出库基础数量');

    const allocations = await q(
      `SELECT a.*,oi.quantity_snapshot,oi.sku_code AS sale_sku_code,b.product_code,b.grade_code_std,b.unit,b.material_code,b.legacy_source,b.base_quantity_version,b.qty,b.expire_date,b.quality_grade,b.sku_code,b.warehouse_code,b.location_code,b.status
         FROM sal_order_item_batch_allocations a
         JOIN sal_order_items oi ON oi.id=a.sales_order_item_id
         JOIN inv_batches b ON b.batch_no=a.batch_no
        WHERE oi.sales_order_id=$1
        ORDER BY a.id FOR UPDATE OF a,b`,
      [orderId],
    );

    // Existing/manual allocation rows are not authorization to consume managed
    // physical stock. Validate before the first inventory/ledger write.
    let outboundAvailable = 0;
    for (const allocation of allocations) {
      const available = Number(allocation.reserved_qty) - Number(allocation.outbound_qty) - Number(allocation.released_qty);
      if (available <= 0) continue;
      if (!await this.isLegacySaleStock(allocation.sku_code, mgr)
          || !await this.isLegacySaleStock(allocation.sale_sku_code, mgr)) {
        throw new ConflictException('旧销售出库禁止使用公司范围管理或未映射 SKU 库存');
      }
      outboundAvailable += available;
    }
    if (outboundAvailable < requestedQty) throw new ConflictException(`订单 ${orderNo} 剩余预留不足，本次需出库 ${requestedQty}`);

    let remaining = requestedQty;
    for (const allocation of allocations) {
      if (remaining <= 0) break;
      const available = Number(allocation.reserved_qty) - Number(allocation.outbound_qty) - Number(allocation.released_qty);
      const outQty = Math.min(available, remaining);
      if (outQty <= 0) continue;
      if (allocation.quantity_snapshot) {
        await SkuPolicy.requireUsable(mgr, allocation.sale_sku_code, 'sale-stock');
        assertBatchPool(allocation, allocation.quantity_snapshot);
        baseQuantity(outQty,1,allocation.quantity_snapshot.baseUnit);
      } else if (allocation.sku_code != null) await SkuPolicy.requireUsable(mgr, allocation.sku_code, 'sale-stock');

        // 正式扣减物理库存（qty）
        const changed = await q(
          `WITH changed AS (
             UPDATE inv_batches
                SET qty = qty - $1, updated_at=NOW()
              WHERE batch_no=$2
                AND company_code=$3
                AND warehouse_code=$4
                AND status='AVAILABLE'
                AND qty >= $1 AND (expire_date IS NULL OR expire_date>=CURRENT_DATE)
              RETURNING batch_no
           ) SELECT batch_no FROM changed`,
          [outQty, allocation.batch_no, companyCode, allocation.warehouse_code],
        );
      if (changed.length !== 1) throw new ConflictException(`出库批次 ${allocation.batch_no} 状态、归属或数量已变化`);

      const ledgerId = await this.writeLedger({
          batchNo:         allocation.batch_no,
          changeType:      'FIFO_OUT',
          qtyChange:       -outQty,
          operator:        this.operator,
          companyCode,
          refNo:           deliveryNo,
          note:            `装车出库 delivery=${deliveryNo} order=${orderNo} allocation=${allocation.id} batch=${allocation.batch_no}`,
          batchExpireDate: allocation.expire_date ?? null,
          qualityGrade:    allocation.quality_grade ?? null,
          skuCode:         allocation.sku_code ?? null,
          warehouseCode: allocation.warehouse_code, locationCode: allocation.location_code,
        }, mgr);

      await q(
        `INSERT INTO sal_order_item_batch_allocation_actions
           (allocation_id,sales_order_id,delivery_order_id,action_type,action_key,qty,ledger_id,created_by)
         VALUES ($1,$2,$3,'OUTBOUND',$4,$5,$6,$7)`,
        [allocation.id, orderId, deliveryId, `delivery:${deliveryId}`, outQty, ledgerId, this.operator],
      );
      const updated = await q(
        `WITH changed AS (
           UPDATE sal_order_item_batch_allocations
              SET outbound_qty=outbound_qty+$1,updated_at=NOW()
            WHERE id=$2 AND outbound_qty+released_qty+$1<=reserved_qty
            RETURNING id
         ) SELECT id FROM changed`,
        [outQty, allocation.id],
      );
      if (updated.length !== 1) throw new ConflictException(`出库 allocation ${allocation.id} 数量已变化`);
      remaining -= outQty;
    }

    if (remaining > 0) throw new ConflictException(`订单 ${orderNo} 剩余预留不足，本次需出库 ${requestedQty}`);

    this.logger.log(`[EggInv] 出库确认: delivery=${deliveryNo} order=${orderNo}`);
    return requestedQty;
  }

  // ── 7. 退货回库（Return Runtime 联动） ───────────────────────────────────────

  async processReturnInventory(
    returnId:    string,
    returnNo:    string,
    companyCode: string,
    targetWarehouseCode: string,
    targetZoneCode: string,
    targetLocationCode: string,
    inboundDate: string,
    mgr?:        EntityManager,
  ): Promise<void> {
    const q = mgr ? mgr.query.bind(mgr) : this.ds.query.bind(this.ds);

    const items = await q(
      `SELECT * FROM sal_return_items WHERE return_order_id=$1`, [returnId],
    );

    for (const item of items) {
      if (item.restock_status !== 'PENDING') {
        throw new ConflictException(`退货明细 ${item.id} 已处理，拒绝重复回库`);
      }
      const accepted = Number(item.accepted_qty);
      const damaged  = Number(item.damaged_qty);
      const batchNo  = `RET-${returnNo}-${item.id}`;

      // Phase H5: sal_return_items 已有 sku_code（从原销售明细继承）
      const returnSkuCode: string | null = item.sku_code ?? null;

      // ── accepted_qty：回库（RETURNED 状态，需重新质检） ──────────────────────
      if (accepted > 0) {
        const originalGrade = item.grade_code ?? 'A';
        const returnGrade   = this.degradeGrade(originalGrade);

        await q(
          `INSERT INTO inv_batches
             (batch_no, product_code, company_code, qty, qty_available,
              quality_grade, source_type, source_no, status, unit, base_quantity_version,
              sku_code, grade_code_std, spec_code, warehouse_code, location_code, inbound_date,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,0,$5,'RETURN',$6,'QUARANTINE',$13,$14,$7,$8,$9,$10,$11,$12::date,NOW(),NOW())`,
          [
            batchNo, item.product_code, companyCode, accepted, returnGrade, returnNo,
            returnSkuCode,
            // Phase H5: returnSkuCode 已从 sal_return_items.sku_code 读取
            returnGrade,
            item.quantity_snapshot?.specCode ?? item.packaging_spec ?? null,
            targetWarehouseCode, targetLocationCode, inboundDate, item.quantity_snapshot?.baseUnit ?? null, item.quantity_snapshot ? 1 : null,
          ],
        );

        await this.writeLedger({
          batchNo,
          changeType:  'SALE_RETURN',
          qtyChange:   accepted,
          operator:    this.operator,
          companyCode,
          refNo:       returnNo,
          qualityGrade: returnGrade,
          skuCode:      returnSkuCode,
          warehouseCode: targetWarehouseCode,
          locationCode: targetLocationCode,
          note:        `退货回库 return=${returnNo} product=${item.product_code} accepted=${accepted} grade=${returnGrade} zone=${targetZoneCode}`,
        }, mgr);

        if (damaged === 0) {
          await q(`UPDATE sal_return_items SET restock_status='RESTOCKED' WHERE id=$1`, [item.id]);
        }
      }

      // ── damaged_qty：损耗（仅写 inv_ledger，不回库） ─────────────────────────
      if (damaged > 0) {
        const damageBatch = `DMG-${returnNo}-${item.product_code}`;
        await this.writeLedger({
          batchNo:     damageBatch,
          changeType:  'DAMAGE_WRITEOFF',
          qtyChange:   damaged,
          operator:    this.operator,
          companyCode,
          refNo:       returnNo,
          note:        `退货损耗 return=${returnNo} product=${item.product_code} damaged=${damaged}`,
          skuCode:     returnSkuCode,
        }, mgr);

        await q(
          `UPDATE sal_return_items SET restock_status=$1 WHERE id=$2`,
          [accepted > 0 ? 'RESTOCKED_WITH_WRITEOFF' : 'WRITTEN_OFF', item.id],
        );
      }
    }

    this.logger.log(`[EggInv] 退货回库处理完成: return=${returnNo}`);
  }

  // ── 8. 标记过期批次 ──────────────────────────────────────────────────────────

  async markExpiredBatches(companyCode?: string): Promise<{ expired: number; written: number }> {
    const cond = companyCode ? `AND company_code='${companyCode}'` : '';

    const expiredBatches = await this.ds.query(
      `SELECT * FROM inv_batches
       WHERE expire_date < CURRENT_DATE
         AND status = 'AVAILABLE'
         AND qty > 0
         ${cond}`,
    );

    let written = 0;
    for (const batch of expiredBatches) {
      const qty = Number(batch.qty);

      await this.ds.query(
        `UPDATE inv_batches
         SET status='EXPIRED', qty_available=0, updated_at=NOW()
         WHERE batch_no=$1`,
        [batch.batch_no],
      );

      // Phase H4: 过期报废时传递 sku_code
      await this.writeLedger({
        batchNo:         batch.batch_no,
        changeType:      'EXPIRE_WRITEOFF',
        qtyChange:       -qty,
        operator:        'scheduler',
        companyCode:     batch.company_code ?? companyCode ?? 'ALL',
        refNo:           batch.batch_no,
        note:            `过期自动报废 batch=${batch.batch_no} expire=${batch.expire_date} qty=${qty}`,
        batchExpireDate: batch.expire_date,
        qualityGrade:    batch.quality_grade,
        skuCode:         batch.sku_code ?? null,
      });

      written += qty;
    }

    this.logger.log(`[EggInv] 过期处理: ${expiredBatches.length} 批次 ${written} 个报废`);
    return { expired: expiredBatches.length, written };
  }

  // ── 9. 查询临期库存 ──────────────────────────────────────────────────────────

  async getExpiringBatches(params: {
    companyCode?: string;
    days?: number;
  }): Promise<EggBatch[]> {
    const days = params.days ?? EXPIRING_WARN_DAYS;
    const companyCodes = this.companyScope(params.companyCode);
    if (companyCodes?.length === 0) return [];
    const values: unknown[] = [days];
    const cond = companyCodes ? `AND b.company_code = ANY($2)` : '';
    if (companyCodes) values.push(companyCodes);

    return this.ds.query(
      `SELECT b.*,
              sku.sku_name, sku.sku_name_en, sku.sku_name_lo,
              COALESCE(p.product_name_zh, sku.sku_name, b.product_code) AS product_name,
              COALESCE(p.product_name_zh, sku.sku_name, b.product_code) AS product_name_zh,
              COALESCE(p.product_name_en, sku.sku_name_en, p.product_name_zh, sku.sku_name, b.product_code) AS product_name_en,
              COALESCE(p.product_name_lo, sku.sku_name_lo, p.product_name_zh, sku.sku_name, b.product_code) AS product_name_lo,
              company.company_name, company.company_name_zh,
              wh.warehouse_name, wh.warehouse_name_zh, wh.warehouse_name_en, wh.warehouse_name_lo,
              loc.location_name,
              (b.expire_date::date - CURRENT_DATE::date) AS days_remaining
       FROM inv_batches b
       LEFT JOIN product_skus sku ON sku.sku_code = b.sku_code
       LEFT JOIN mst_products p ON p.product_code = b.product_code
       LEFT JOIN wms_warehouses wh ON wh.warehouse_code = b.warehouse_code
       LEFT JOIN wms_locations loc ON loc.location_code = b.location_code AND loc.warehouse_code = b.warehouse_code
       LEFT JOIN LATERAL (
         SELECT o.org_name AS company_name, o.org_name_cn AS company_name_zh
           FROM sys_organizations o
          WHERE o.org_type = 'COMPANY' AND COALESCE(o.company_code, o.org_code) = b.company_code
          ORDER BY o.org_code LIMIT 1
       ) company ON TRUE
       WHERE b.status = 'AVAILABLE'
         AND b.qty_available > 0
         AND ${this.eggFamilyCondition()}
         AND b.expire_date IS NOT NULL
         AND b.expire_date >= CURRENT_DATE
         AND b.expire_date <= CURRENT_DATE + ($1 * INTERVAL '1 day')
         ${cond}
       ORDER BY b.expire_date ASC, b.batch_no ASC, b.id ASC`, values,
    );
  }

  // ── 10. Dashboard 统计 ───────────────────────────────────────────────────────

  async getDashboardStats(companyCode?: string) {
    const companyCodes = this.companyScope(companyCode);
    const empty = {
      activeBatches: 0, totalAvailable: 0, expiringBatches: 0, expiringQty: 0,
      expiredBatches: 0, returnedBatches: 0, skuLinkedBatches: 0,
      todayExpireLoss: 0, todayDamageLoss: 0, todayWriteOff: 0,
      expiringWarnDays: EXPIRING_WARN_DAYS,
    };
    if (companyCodes?.length === 0) return empty;
    const batchArgs: unknown[] = [];
    const batchCompanyCond = companyCodes ? `AND b.company_code = ANY($1)` : '';
    if (companyCodes) batchArgs.push(companyCodes);

    // [Phase R2 — Config Governance] 临期预警天数从 sys_configs 读取
    const expiringDays = await this._cfgInt('inventory.expiring_warn_days', EXPIRING_WARN_DAYS);

    const [row] = await this.ds.query(`
      SELECT
        COUNT(*) FILTER (WHERE b.status='AVAILABLE' AND b.qty_available > 0
          AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE))          AS active_batches,
        COALESCE(SUM(b.qty_available) FILTER (WHERE b.status='AVAILABLE' AND b.qty_available > 0
          AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)), 0)       AS total_available,
        COUNT(*) FILTER (
          WHERE b.status='AVAILABLE' AND b.qty_available > 0
            AND b.expire_date IS NOT NULL
            AND b.expire_date >= CURRENT_DATE
            AND b.expire_date <= CURRENT_DATE + (${expiringDays} * INTERVAL '1 day')
        )                                                                        AS expiring_batches,
        COALESCE(SUM(b.qty_available) FILTER (
          WHERE b.status='AVAILABLE' AND b.qty_available > 0
            AND b.expire_date IS NOT NULL
            AND b.expire_date >= CURRENT_DATE
            AND b.expire_date <= CURRENT_DATE + (${expiringDays} * INTERVAL '1 day')
        ), 0)                                                                    AS expiring_qty,
        COUNT(*) FILTER (WHERE b.status='EXPIRED')                               AS expired_batches,
        COUNT(*) FILTER (WHERE b.status='RETURNED')                              AS returned_batches,
        -- Phase H4: 统计已接入 SKU 的批次数量
        COUNT(*) FILTER (WHERE b.sku_code IS NOT NULL AND b.status='AVAILABLE'
          AND b.qty_available > 0
          AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE))          AS sku_linked_batches
      FROM inv_batches b
      WHERE ${this.eggFamilyCondition()} ${batchCompanyCond}
    `, batchArgs);

    const ledgerArgs: unknown[] = [];
    const ledgerCompanyCond = companyCodes ? `AND company_code = ANY($1)` : '';
    if (companyCodes) ledgerArgs.push(companyCodes);

    // 今日损耗
    const [lossRow] = await this.ds.query(`
      SELECT
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='EXPIRE_WRITEOFF'), 0) AS expire_loss,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='DAMAGE_WRITEOFF'), 0) AS damage_loss,
        COALESCE(SUM(ABS(qty_change)) FILTER (WHERE change_type='WRITE_OFF'), 0)       AS write_off
      FROM inv_ledger
      WHERE created_at >= CURRENT_DATE ${ledgerCompanyCond}
    `, ledgerArgs);

    return {
      activeBatches:    Number(row.active_batches),
      totalAvailable:   Number(row.total_available),
      expiringBatches:  Number(row.expiring_batches),
      expiringQty:      Number(row.expiring_qty),
      expiredBatches:   Number(row.expired_batches),
      returnedBatches:  Number(row.returned_batches),
      /** Phase H4: 已接入 SKU 的活跃批次数 */
      skuLinkedBatches: Number(row.sku_linked_batches),
      todayExpireLoss:  Number(lossRow.expire_loss),
      todayDamageLoss:  Number(lossRow.damage_loss),
      todayWriteOff:    Number(lossRow.write_off),
      expiringWarnDays: expiringDays,
    };
  }

  // ── 11. 损耗分析 ─────────────────────────────────────────────────────────────

  async getLossAnalysis(companyCode?: string) {
    const companyCodes = this.companyScope(companyCode);
    const emptyResult = {
      byType: [],
      byBatch: [],
      summary: {
        expire_total: 0,
        damage_total: 0,
        write_off_total: 0,
        total_records: 0,
        total_expire_loss: 0,
        total_damage_loss: 0,
        total_loss: 0,
      },
    };
    if (companyCodes?.length === 0) return emptyResult;

    const args: unknown[] = [];
    const companyCond = companyCodes ? 'AND il.company_code = ANY($1)' : '';
    if (companyCodes) args.push(companyCodes);

    const byTypeRows = await this.ds.query(`
      SELECT il.change_type,
             COUNT(*) AS record_count,
             COUNT(DISTINCT il.batch_no) AS batch_count,
             COALESCE(SUM(ABS(il.qty_change)), 0) AS total_qty
      FROM inv_ledger il
      WHERE il.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
        AND il.created_at >= NOW() - INTERVAL '30 days'
        ${companyCond}
      GROUP BY il.change_type
      ORDER BY total_qty DESC
    `, args);

    const byBatchRows = await this.ds.query(`
      SELECT il.batch_no,
             MAX(b.product_code) AS product_code,
             MAX(COALESCE(il.sku_code, b.sku_code)) AS sku_code,
             COUNT(*) AS record_count,
             COALESCE(SUM(ABS(il.qty_change)), 0) AS total_loss,
             MAX(il.created_at) AS last_event
      FROM inv_ledger il
      LEFT JOIN inv_batches b
        ON b.batch_no = il.batch_no
       AND b.company_code = il.company_code
      WHERE il.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
        AND il.created_at >= NOW() - INTERVAL '30 days'
        ${companyCond}
      GROUP BY il.company_code, il.batch_no
      ORDER BY total_loss DESC, last_event DESC
      LIMIT 20
    `, args);

    const [summaryRow] = await this.ds.query(`
      SELECT
        COALESCE(SUM(ABS(il.qty_change)) FILTER (WHERE il.change_type='EXPIRE_WRITEOFF'), 0) AS expire_total,
        COALESCE(SUM(ABS(il.qty_change)) FILTER (WHERE il.change_type='DAMAGE_WRITEOFF'), 0) AS damage_total,
        COALESCE(SUM(ABS(il.qty_change)) FILTER (WHERE il.change_type='WRITE_OFF'), 0)       AS write_off_total,
        COALESCE(SUM(ABS(il.qty_change)), 0) AS total_loss,
        COUNT(*) AS total_records
      FROM inv_ledger il
      WHERE il.change_type IN ('EXPIRE_WRITEOFF','DAMAGE_WRITEOFF','WRITE_OFF','QC_REJECT')
        AND il.created_at >= NOW() - INTERVAL '30 days'
        ${companyCond}
    `, args);

    // Keep the original aliases during the API transition while also returning
    // the fields consumed by the inventory Loss tab.
    const byType = byTypeRows.map((row: Record<string, unknown>) => {
      const recordCount = Number(row.record_count ?? 0);
      const batchCount = Number(row.batch_count ?? 0);
      const totalLoss = Number(row.total_qty ?? 0);
      return {
        change_type: row.change_type,
        record_count: recordCount,
        batch_count: batchCount,
        total_qty: totalLoss,
        total_loss: totalLoss,
      };
    });
    const byBatch = byBatchRows.map((row: Record<string, unknown>) => ({
      ...row,
      record_count: Number(row.record_count ?? 0),
      total_loss: Number(row.total_loss ?? 0),
    }));
    const expireTotal = Number(summaryRow?.expire_total ?? 0);
    const damageTotal = Number(summaryRow?.damage_total ?? 0);
    const writeOffTotal = Number(summaryRow?.write_off_total ?? 0);
    const totalLoss = Number(summaryRow?.total_loss ?? 0);
    const summary = {
      expire_total: expireTotal,
      damage_total: damageTotal,
      write_off_total: writeOffTotal,
      total_records: Number(summaryRow?.total_records ?? 0),
      total_expire_loss: expireTotal,
      total_damage_loss: damageTotal,
      total_loss: totalLoss,
    };

    return { byType, byBatch, summary };
  }

  // ── 内部：等级降级 ───────────────────────────────────────────────────────────

  private degradeGrade(grade: string): string {
    const ladder: Record<string, string> = {
      AA: 'A', A: 'B', B: 'B', DIRTY: 'DAMAGED', CRACKED: 'DAMAGED', DAMAGED: 'DAMAGED',
    };
    return ladder[grade] ?? grade;
  }

  // ── Config Governance helpers ─────────────────────────────────────────────
  /** [Phase R2] 从 sys_configs 读取整数配置，失败时返回 defaultVal */
  private async _cfgInt(key: string, defaultVal: number): Promise<number> {
    try {
      const rows: Array<{ config_value: string }> = await this.ds.query(
        `SELECT config_value FROM sys_configs WHERE config_key = $1`, [key],
      );
      const v = rows[0]?.config_value;
      if (v == null) return defaultVal;
      const n = parseInt(v, 10);
      return isNaN(n) ? defaultVal : n;
    } catch {
      return defaultVal;
    }
  }
}
