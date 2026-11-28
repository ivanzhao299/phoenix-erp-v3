import { createHash } from 'node:crypto';
import { Injectable, Logger, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

export type InventorySourceMode = 'TEMP_PRODUCTION_INBOUND' | 'PACKAGING_INBOUND';
export type ScopeLevel = 'GROUP' | 'COMPANY' | 'SITE';
export type ResolvedInventorySourceMode = { mode: InventorySourceMode; scopeLevel: ScopeLevel | 'DEFAULT'; scopeCode: string | null };

const VALID_MODES: InventorySourceMode[] = ['TEMP_PRODUCTION_INBOUND', 'PACKAGING_INBOUND'];
const DEFAULT_MODE: ResolvedInventorySourceMode = { mode: 'TEMP_PRODUCTION_INBOUND', scopeLevel: 'DEFAULT', scopeCode: null };

/**
 * InventorySourceModeService — 库存来源模式治理 Phase P1A
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/production-inventory-source-mode-phase-p1a.md
 *
 * 库存来源唯一：TEMP_PRODUCTION_INBOUND（临时生产入库）与 PACKAGING_INBOUND（包装入库）
 *   二选一，互斥，统一进入 inv_batches/inv_ledger/Sales V2 FIFO。
 *
 * 模式解析优先级：SITE → COMPANY → GROUP → 默认 TEMP_PRODUCTION_INBOUND。
 * 切换需 ADMIN/CEO/FACTORY_MGR（控制器层校验），并记录审计日志 + 切换前风险快照。
 */
@Injectable()
export class InventorySourceModeService {
  private readonly logger = new Logger(InventorySourceModeService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private get operator(): string {
    try { return (this.cls.get('user') as any)?.username ?? 'system'; } catch { return 'system'; }
  }

  /** 解析当前生效模式：SITE → COMPANY → GROUP → 默认 */
  async resolveMode(
    scope: { siteCode?: string | null; companyCode?: string | null },
    mgr?: EntityManager,
    options?: { failClosed: boolean },
  ): Promise<InventorySourceMode> {
    return (await this.resolveModeConfig(scope, mgr, options)).mode;
  }

  async resolveModeConfig(
    scope: { siteCode?: string | null; companyCode?: string | null },
    mgr?: EntityManager,
    options?: { failClosed: boolean },
  ): Promise<ResolvedInventorySourceMode> {
    try {
      // A new SITE override can supersede an existing COMPANY or GROUP row.
      // Hold the configuration stable until the strict posting transaction commits.
      if (mgr && options?.failClosed) await mgr.query('LOCK TABLE inv_source_mode IN SHARE MODE');
      const rows = await (mgr ?? this.ds).query(
        `SELECT scope_level, scope_code, mode FROM inv_source_mode
          WHERE (scope_level = 'SITE'    AND scope_code = $1)
             OR (scope_level = 'COMPANY' AND scope_code = $2)
             OR (scope_level = 'GROUP'   AND scope_code = 'ALL')
          ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END
          LIMIT 1`,
        [scope.siteCode ?? '__none__', scope.companyCode ?? '__none__'],
      );
      const row = rows[0];
      const mode = row?.mode as InventorySourceMode | undefined;
      if (scope.siteCode && rows[0]?.scope_level !== 'SITE') {
        this.logger.warn(
          `[InvSourceMode][CONFIG_FALLBACK] SITE/${scope.siteCode} 无精确模式配置，` +
          `回落 ${rows[0]?.scope_level ?? 'DEFAULT'}/${rows[0]?.scope_code ?? 'TEMP_PRODUCTION_INBOUND'}`,
        );
      }
      if (rows.length && (!mode || !VALID_MODES.includes(mode)) && options?.failClosed) {
        throw new BadRequestException('当前鸡舍库存来源模式无效');
      }
      return mode && VALID_MODES.includes(mode)
        ? { mode, scopeLevel: row.scope_level, scopeCode: row.scope_code }
        : DEFAULT_MODE;
    } catch (error) {
      this.logger.error(
        `[InvSourceMode][CONFIG_ERROR] 模式解析失败 site=${scope.siteCode ?? '-'} company=${scope.companyCode ?? '-'}，禁止静默：${(error as Error).message}`,
      );
      if (options?.failClosed) throw error;
      return DEFAULT_MODE;
    }
  }

  /** ACTIVE 场站/班次与 SITE 配置一致性巡检；返回告警并写结构化日志。 */
  async auditSiteConfiguration(): Promise<Array<{ code: string; siteCode: string; detail: string }>> {
    const rows = await this.ds.query(
      `WITH authoritative AS (
         SELECT farm_code AS site_code FROM ${OrgOwnershipService.FARM_TABLE} WHERE status = 'ACTIVE'
       ), active_shift_sites AS (
         SELECT DISTINCT site_id AS site_code FROM pkg_work_shifts
          WHERE status IN ('OPEN','ACTIVE') AND site_id IS NOT NULL
       ), configured AS (
         SELECT scope_code AS site_code FROM inv_source_mode WHERE scope_level = 'SITE'
       )
       SELECT 'ACTIVE_SITE_WITHOUT_CONFIG' AS code, a.site_code,
              'ACTIVE 场站缺少 SITE 库存来源配置' AS detail
         FROM authoritative a LEFT JOIN configured c USING (site_code) WHERE c.site_code IS NULL
       UNION ALL
       SELECT 'ACTIVE_SHIFT_UNKNOWN_SITE', s.site_code, 'ACTIVE 班次引用非权威场站标识'
         FROM active_shift_sites s LEFT JOIN authoritative a USING (site_code) WHERE a.site_code IS NULL
       UNION ALL
       SELECT 'ACTIVE_SHIFT_WITHOUT_CONFIG', s.site_code, 'ACTIVE 班次场站缺少 SITE 库存来源配置'
         FROM active_shift_sites s LEFT JOIN configured c USING (site_code) WHERE c.site_code IS NULL
       UNION ALL
       SELECT 'ORPHAN_SITE_CONFIG', c.site_code, 'SITE 库存来源配置未命中 ACTIVE 权威场站'
         FROM configured c LEFT JOIN authoritative a USING (site_code) WHERE a.site_code IS NULL
       ORDER BY code, site_code`,
    );
    for (const row of rows) {
      this.logger.warn(`[InvSourceMode][${row.code}] site=${row.site_code} ${row.detail}`);
    }
    return rows.map((row: any) => ({ code: row.code, siteCode: row.site_code, detail: row.detail }));
  }

  assertGlobalGovernance(): void {
    if (this.cls.get('dataScope')?.isGlobal !== true) {
      throw new ForbiddenException('库存来源模式治理需要集团数据范围');
    }
  }

  /** 列出全部模式配置 */
  async listConfigs(): Promise<any[]> {
    this.assertGlobalGovernance();
    try {
      const configs = await this.ds.query(
        `SELECT scope_level, scope_code, mode, remark, updated_by, updated_at
           FROM inv_source_mode
          ORDER BY CASE scope_level WHEN 'GROUP' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END, scope_code`,
      );
      await this.auditSiteConfiguration();
      return configs;
    } catch (error) {
      this.logger.error(`[InvSourceMode][CONFIG_AUDIT_ERROR] 配置一致性巡检失败：${(error as Error).message}`);
      throw error;
    }
  }

  /** 最近切换审计 */
  async listAudit(limit = 50): Promise<any[]> {
    this.assertGlobalGovernance();
    return this.ds.query(
      `SELECT scope_level, scope_code, old_mode, new_mode, operator, remark, risk_snapshot, created_at
         FROM inv_source_mode_audit
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)],
    );
  }

  /**
   * 切换前风险评估（第六步）：
   *   库存余额 / 最后入库日期 / 最后包装日期 / 未完成包装批次 / 未确认库存（待上架）
   * 不直接切换，先输出风险提示。
   */
  async assessSwitchRisk(scopeLevel: ScopeLevel, scopeCode: string, newMode: InventorySourceMode, manager?: EntityManager): Promise<{
    scopeLevel: ScopeLevel;
    scopeCode: string;
    currentMode: InventorySourceMode;
    newMode: InventorySourceMode;
    balance: number;
    lastInboundDate: string | null;
    lastPackagingDate: string | null;
    unfinishedPackagingBatches: number;
    unconfirmedInventory: number;
    warnings: string[];
    canSwitch: boolean;
    riskDigest: string;
  }> {
    this.assertGlobalGovernance();
    if (!['GROUP', 'COMPANY', 'SITE'].includes(scopeLevel) || typeof scopeCode !== 'string' || !scopeCode.trim()
      || (scopeLevel === 'GROUP' && scopeCode !== 'ALL')) {
      throw new BadRequestException('库存来源模式范围无效');
    }
    if (!VALID_MODES.includes(newMode)) {
      throw new BadRequestException(`无效模式：${newMode}，有效值：${VALID_MODES.join(' / ')}`);
    }
    const companyCode = scopeLevel === 'COMPANY' ? scopeCode : null;
    const siteCode = scopeLevel === 'SITE' ? scopeCode : null;
    const q = (sql: string, args: unknown[] = []) => (manager ?? this.ds).query(sql, args);
    let inheritedCompany = companyCode;
    if (siteCode) {
      const owners = await q(
        `SELECT company_code FROM ${OrgOwnershipService.FARM_TABLE}
          WHERE farm_code=$1 AND status='ACTIVE'`,
        [siteCode],
      );
      if (owners.length !== 1 || !owners[0].company_code?.trim()) {
        throw new BadRequestException('库存来源模式的场站缺少有效公司归属');
      }
      inheritedCompany = owners[0].company_code;
    }
    const currentMode = await this.resolveMode({ siteCode, companyCode: inheritedCompany }, manager, { failClosed: true });

    // 可售库存余额（非 legacy）
    const balRows = await q(
      `SELECT COALESCE(SUM(qty_available),0) AS bal FROM inv_batches
        WHERE legacy_source IS NULL AND status = 'AVAILABLE'
          ${companyCode ? 'AND company_code = $1' : ''}`,
      companyCode ? [companyCode] : [],
    );
    const balance = Number(balRows[0]?.bal ?? 0);

    // 最后入库日期（TEMP/PACKAGING/INBOUND 任一）
    const inbRows = await q(
      `SELECT MAX(created_at)::date AS d FROM inv_ledger
        WHERE change_type IN ('TEMP_PRODUCTION_INBOUND','PACKAGING_INBOUND','INBOUND')`,
    );
    const lastInboundDate = inbRows[0]?.d ?? null;

    // 最后包装日期
    const pkgRows = await q(`SELECT MAX(completed_at)::date AS d FROM pkg_tasks WHERE status = 'COMPLETED'`);
    const lastPackagingDate = pkgRows[0]?.d ?? null;

    // 未完成包装批次
    const unfRows = await q(
      `SELECT COUNT(*)::int AS c FROM pkg_tasks WHERE status NOT IN ('COMPLETED','DONE','CANCELLED')`,
    );
    const unfinishedPackagingBatches = Number(unfRows[0]?.c ?? 0);

    // 未确认库存（包装产出待仓库上架）
    const uncRows = await q(`SELECT COUNT(*)::int AS c FROM wms_inbound WHERE status = 'PENDING'`);
    const unconfirmedInventory = Number(uncRows[0]?.c ?? 0);

    const warnings: string[] = [];
    if (currentMode === newMode) warnings.push(`当前已是 ${newMode} 模式，无需切换。`);
    if (unfinishedPackagingBatches > 0)
      warnings.push(`存在 ${unfinishedPackagingBatches} 个未完成包装批次，切换后其入库行为将受新模式约束。`);
    if (unconfirmedInventory > 0)
      warnings.push(`存在 ${unconfirmedInventory} 笔未确认库存（待上架），建议先完成仓库验收。`);
    if (newMode === 'PACKAGING_INBOUND')
      warnings.push('切换为包装入库模式后，日产蛋入库将被禁止，必须经包装完成生成库存。');
    if (newMode === 'TEMP_PRODUCTION_INBOUND')
      warnings.push('切换为临时生产入库模式后，包装完成将不再生成可售库存（仅保留中间态）。');

    // 允许切换：模式有效且与当前不同
    const canSwitch = currentMode !== newMode;

    const risk = {
      scopeLevel, scopeCode, currentMode, newMode,
      balance, lastInboundDate, lastPackagingDate,
      unfinishedPackagingBatches, unconfirmedInventory, warnings, canSwitch,
    };
    return { ...risk, riskDigest: createHash('sha256').update(JSON.stringify(risk)).digest('hex') };
  }

  /**
   * 执行切换（第五步）：写审计日志 + 风险快照 + upsert 模式。
   * 控制器层已校验角色 ∈ {ADMIN, CEO, FACTORY_MGR}。
   */
  async switchMode(dto: {
    scopeLevel: ScopeLevel;
    scopeCode: string;
    newMode: InventorySourceMode;
    remark?: string;
    confirmRisk?: boolean;
    riskDigest?: string;
    requestKey?: string;
  }) {
    this.assertGlobalGovernance();
    if (dto?.confirmRisk !== true || !/^[0-9a-f]{64}$/.test(dto.riskDigest ?? '')
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(dto.requestKey ?? '')) {
      throw new BadRequestException('请先评估风险并提交有效的确认版本与申请标识');
    }
    const operator = this.operator;
    const requestDigest = createHash('sha256').update(JSON.stringify([
      dto.scopeLevel, dto.scopeCode, dto.newMode, dto.remark ?? null, dto.riskDigest,
    ])).digest('hex');
    return this.ds.transaction(async manager => {
      await manager.query('LOCK TABLE inv_source_mode IN SHARE ROW EXCLUSIVE MODE');
      const [past] = await manager.query(
        `SELECT id::text AS audit_id,old_mode,new_mode,scope_level,scope_code,risk_snapshot->>'requestDigest' AS payload_digest
         FROM inv_source_mode_audit WHERE operator=$1 AND risk_snapshot->>'requestKey'=$2`, [operator,dto.requestKey]);
      if (past) {
        if (past.payload_digest !== requestDigest) throw new ConflictException('申请标识已用于其他来源模式切换');
        return { ok: true, auditId: past.audit_id, oldMode: past.old_mode, newMode: past.new_mode,
          scopeLevel: past.scope_level, scopeCode: past.scope_code };
      }
      const risk = await this.assessSwitchRisk(dto.scopeLevel, dto.scopeCode, dto.newMode, manager);
      if (risk.riskDigest !== dto.riskDigest || !risk.canSwitch) {
        throw new ConflictException('库存来源风险或模式已变化，请重新评估');
      }
      const [current] = await manager.query(
        'SELECT mode FROM inv_source_mode WHERE scope_level=$1 AND scope_code=$2', [dto.scopeLevel,dto.scopeCode]);
      const oldMode = (current?.mode as InventorySourceMode) ?? null;
      await manager.query(
        `INSERT INTO inv_source_mode (scope_level,scope_code,mode,remark,updated_by,updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (scope_level,scope_code) DO UPDATE SET mode=EXCLUDED.mode,remark=EXCLUDED.remark,
           updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [dto.scopeLevel,dto.scopeCode,dto.newMode,dto.remark ?? null,operator]);
      const [saved] = await manager.query(
        `INSERT INTO inv_source_mode_audit (scope_level,scope_code,old_mode,new_mode,operator,remark,risk_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id::text AS audit_id`,
        [dto.scopeLevel,dto.scopeCode,oldMode,dto.newMode,operator,dto.remark ?? null,
          JSON.stringify({ ...risk, requestKey: dto.requestKey, requestDigest })]);
      return { ok: true, auditId: saved.audit_id, oldMode, newMode: dto.newMode,
        scopeLevel: dto.scopeLevel, scopeCode: dto.scopeCode };
    });
  }
}
