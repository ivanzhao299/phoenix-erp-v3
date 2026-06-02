import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

export type InventorySourceMode = 'TEMP_PRODUCTION_INBOUND' | 'PACKAGING_INBOUND';
export type ScopeLevel = 'GROUP' | 'COMPANY' | 'SITE';

const VALID_MODES: InventorySourceMode[] = ['TEMP_PRODUCTION_INBOUND', 'PACKAGING_INBOUND'];
const DEFAULT_MODE: InventorySourceMode = 'TEMP_PRODUCTION_INBOUND';

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
  async resolveMode(scope: { siteCode?: string | null; companyCode?: string | null }): Promise<InventorySourceMode> {
    try {
      const rows = await this.ds.query(
        `SELECT mode FROM inv_source_mode
          WHERE (scope_level = 'SITE'    AND scope_code = $1)
             OR (scope_level = 'COMPANY' AND scope_code = $2)
             OR (scope_level = 'GROUP'   AND scope_code = 'ALL')
          ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END
          LIMIT 1`,
        [scope.siteCode ?? '__none__', scope.companyCode ?? '__none__'],
      );
      const mode = rows[0]?.mode as InventorySourceMode | undefined;
      return mode && VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
    } catch {
      return DEFAULT_MODE;
    }
  }

  /** 列出全部模式配置 */
  async listConfigs(): Promise<any[]> {
    try {
      return await this.ds.query(
        `SELECT scope_level, scope_code, mode, remark, updated_by, updated_at
           FROM inv_source_mode
          ORDER BY CASE scope_level WHEN 'GROUP' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END, scope_code`,
      );
    } catch { return []; }
  }

  /** 最近切换审计 */
  async listAudit(limit = 50): Promise<any[]> {
    try {
      return await this.ds.query(
        `SELECT scope_level, scope_code, old_mode, new_mode, operator, remark, risk_snapshot, created_at
           FROM inv_source_mode_audit
          ORDER BY created_at DESC
          LIMIT $1`,
        [Math.min(Math.max(limit, 1), 200)],
      );
    } catch { return []; }
  }

  /**
   * 切换前风险评估（第六步）：
   *   库存余额 / 最后入库日期 / 最后包装日期 / 未完成包装批次 / 未确认库存（待上架）
   * 不直接切换，先输出风险提示。
   */
  async assessSwitchRisk(scopeLevel: ScopeLevel, scopeCode: string, newMode: InventorySourceMode): Promise<{
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
  }> {
    if (!VALID_MODES.includes(newMode)) {
      throw new BadRequestException(`无效模式：${newMode}，有效值：${VALID_MODES.join(' / ')}`);
    }
    const companyCode = scopeLevel === 'COMPANY' ? scopeCode : null;
    const currentMode = await this.resolveMode({
      siteCode: scopeLevel === 'SITE' ? scopeCode : null,
      companyCode,
    });

    const q = async (sql: string, args: unknown[] = []) => {
      try { return await this.ds.query(sql, args); } catch { return []; }
    };

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

    return {
      scopeLevel, scopeCode, currentMode, newMode,
      balance, lastInboundDate, lastPackagingDate,
      unfinishedPackagingBatches, unconfirmedInventory,
      warnings, canSwitch,
    };
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
  }): Promise<{ ok: boolean; scopeLevel: ScopeLevel; scopeCode: string; oldMode: InventorySourceMode | null; newMode: InventorySourceMode }> {
    if (!VALID_MODES.includes(dto.newMode)) {
      throw new BadRequestException(`无效模式：${dto.newMode}`);
    }
    const risk = await this.assessSwitchRisk(dto.scopeLevel, dto.scopeCode, dto.newMode);
    if (!risk.canSwitch) {
      throw new BadRequestException(`无法切换：当前已是 ${risk.currentMode} 模式。`);
    }
    if (!dto.confirmRisk) {
      throw new BadRequestException('切换前必须确认风险提示（confirmRisk=true）。请先调用风险评估接口查看风险，再确认切换。');
    }

    const operator = this.operator;
    const oldRows = await this.ds.query(
      `SELECT mode FROM inv_source_mode WHERE scope_level = $1 AND scope_code = $2`,
      [dto.scopeLevel, dto.scopeCode],
    );
    const oldMode = (oldRows[0]?.mode as InventorySourceMode) ?? null;

    // upsert 模式
    await this.ds.query(
      `INSERT INTO inv_source_mode (scope_level, scope_code, mode, remark, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (scope_level, scope_code)
       DO UPDATE SET mode = EXCLUDED.mode, remark = EXCLUDED.remark,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [dto.scopeLevel, dto.scopeCode, dto.newMode, dto.remark ?? null, operator],
    );

    // 审计日志 + 风险快照
    await this.ds.query(
      `INSERT INTO inv_source_mode_audit
         (scope_level, scope_code, old_mode, new_mode, operator, remark, risk_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [dto.scopeLevel, dto.scopeCode, oldMode, dto.newMode, operator, dto.remark ?? null, JSON.stringify(risk)],
    );

    this.logger.log(
      `[InvSourceMode] 切换 ${dto.scopeLevel}/${dto.scopeCode}: ${oldMode ?? '(无)'} → ${dto.newMode} by ${operator}`,
    );
    return { ok: true, scopeLevel: dto.scopeLevel, scopeCode: dto.scopeCode, oldMode, newMode: dto.newMode };
  }
}
