import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OrgOwnershipService } from '../org/services/org-ownership.service';

// 默认饲料品种（来自实际台账），单位均为公斤
const DEFAULT_MATERIALS = [
  { name: '玉米',     unit: '公斤', daily_usage: 15000 },
  { name: '豆粕',     unit: '公斤', daily_usage: 6000  },
  { name: '预混料',   unit: '公斤', daily_usage: 450   },
  { name: '青年预混料', unit: '公斤', daily_usage: 150  },
  { name: '豆油',     unit: '公斤', daily_usage: 240   },
  { name: '石粉',     unit: '公斤', daily_usage: 1300  },
  { name: '米糠',     unit: '公斤', daily_usage: 500   },
];

// 默认栋舍列表
// G109：删除 DEFAULT_HOUSES 硬编码兜底（曾是第三套漂移名）——鸡舍唯一来源 brd_houses。

@Injectable()
export class FarmFeedService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly ownership: OrgOwnershipService,
  ) {}

  // ── 初始化表结构 ──────────────────────────────────────────────────────────────
  async ensureTable() {
    await this.em.query(`
      CREATE TABLE IF NOT EXISTS farm_feed_ledger (
        id            SERIAL PRIMARY KEY,
        ledger_date   DATE         NOT NULL,
        material_name VARCHAR(100) NOT NULL,
        unit          VARCHAR(20)  NOT NULL DEFAULT '公斤',
        sort_order    INT          NOT NULL DEFAULT 0,
        prev_stock    DECIMAL(12,2) NOT NULL DEFAULT 0,
        inbound_qty   DECIMAL(12,2) NOT NULL DEFAULT 0,
        outbound_detail JSONB       NOT NULL DEFAULT '{}',
        outbound_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
        daily_usage   DECIMAL(12,2) NOT NULL DEFAULT 0,
        note          VARCHAR(200),
        operator      VARCHAR(50),
        created_at    TIMESTAMP DEFAULT now(),
        updated_at    TIMESTAMP DEFAULT now(),
        UNIQUE (ledger_date, material_name)
      )
    `);
    await this.em.query(`CREATE INDEX IF NOT EXISTS idx_feed_ledger_date ON farm_feed_ledger(ledger_date DESC)`);
  }

  // ── 查询某日台账（若无数据则从前日结转） ─────────────────────────────────────
  async getLedger(date: string) {
    await this.ensureTable();

    const rows: any[] = await this.em.query(
      `SELECT * FROM farm_feed_ledger WHERE ledger_date = $1 ORDER BY sort_order, material_name`,
      [date],
    );

    if (rows.length > 0) {
      return { code: 200, data: rows.map(this.formatRow) };
    }

    // 无当日数据 → 从前日结转 prev_stock，返回空白模板
    const prevDate = this.prevDay(date);
    const prevRows: any[] = await this.em.query(
      `SELECT * FROM farm_feed_ledger WHERE ledger_date = $1 ORDER BY sort_order, material_name`,
      [prevDate],
    );

    const prevMap = new Map(prevRows.map(r => [r.material_name, r]));
    const template = DEFAULT_MATERIALS.map((m, i) => {
      const prev = prevMap.get(m.name);
      const prevStock = prev ? Number(prev.prev_stock) + Number(prev.inbound_qty) - Number(prev.outbound_total) : 0;
      return this.formatRow({
        id: null, ledger_date: date,
        material_name: m.name, unit: m.unit, sort_order: i,
        prev_stock: prevStock < 0 ? 0 : prevStock,
        inbound_qty: 0, outbound_detail: {}, outbound_total: 0,
        daily_usage: prev ? Number(prev.daily_usage) : m.daily_usage,
        note: '', operator: '',
      });
    });

    return { code: 200, data: template };
  }

  // ── 保存台账（单日全量 upsert） ───────────────────────────────────────────────
  async saveLedger(date: string, items: any[], operator: string) {
    await this.ensureTable();
    for (const item of items) {
      const outboundDetail = item.outbound_detail ?? {};
      const outboundTotal  = Object.values(outboundDetail).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      await this.em.query(`
        INSERT INTO farm_feed_ledger
          (ledger_date, material_name, unit, sort_order, prev_stock, inbound_qty,
           outbound_detail, outbound_total, daily_usage, note, operator, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        ON CONFLICT (ledger_date, material_name)
        DO UPDATE SET
          inbound_qty     = EXCLUDED.inbound_qty,
          outbound_detail = EXCLUDED.outbound_detail,
          outbound_total  = EXCLUDED.outbound_total,
          daily_usage     = EXCLUDED.daily_usage,
          prev_stock      = EXCLUDED.prev_stock,
          note            = EXCLUDED.note,
          operator        = EXCLUDED.operator,
          updated_at      = now()
      `, [
        date, item.material_name, item.unit ?? '公斤', item.sort_order ?? 0,
        item.prev_stock ?? 0, item.inbound_qty ?? 0,
        JSON.stringify(outboundDetail), outboundTotal,
        item.daily_usage ?? 0, item.note ?? '', operator,
      ]);
    }
    return this.getLedger(date);
  }

  // ── 查询历史范围 ──────────────────────────────────────────────────────────────
  async getLedgerRange(startDate: string, endDate: string) {
    await this.ensureTable();
    const rows = await this.em.query(
      `SELECT * FROM farm_feed_ledger WHERE ledger_date BETWEEN $1 AND $2 ORDER BY ledger_date DESC, sort_order`,
      [startDate, endDate],
    );
    return { code: 200, data: rows.map(this.formatRow) };
  }

  // ── 获取栋舍列表（从 brd_houses 表读取，按农场隔离） ────────────────────────
  // G16-2：支持按 farm_code 或 site_code 过滤
  async getHouses(farmCodes?: string[], siteCodes?: string[], companyCodes?: string[]) {
    const params: any[] = [];
    let where = `WHERE brd_houses.status = 'ACTIVE'`;
    // G125：支持多场（全局用户不传 → 看全部；多场用户传全集 → ANY 并集）。
    const ors: string[] = [];
    if (farmCodes?.length) { params.push(farmCodes); ors.push(`brd_houses.farm_code = ANY($${params.length})`); }
    if (siteCodes?.length) { params.push(siteCodes); ors.push(`${OrgOwnershipService.FARM_SITE_SQL} = ANY($${params.length})`); }
    if (companyCodes?.length) {
      params.push(companyCodes);
      ors.push(`NULLIF(f.company_code, '') = ANY($${params.length})`);
    }
    if (ors.length) where += ` AND (${ors.join(' OR ')})`;
    // G109：返回 house_code + 中文 house_name（手机端显示中文名、以 code 为数据键）。
    //   去掉 DEFAULT_HOUSES 硬编码兜底——无数据即返回空(提示去建鸡舍)，杜绝第三套漂移名。
    const rows = await this.em.query(
      `SELECT brd_houses.house_code, brd_houses.house_name
         FROM brd_houses
         LEFT JOIN brd_farms f ON f.farm_code = brd_houses.farm_code AND f.status = 'ACTIVE'
         ${where} ORDER BY brd_houses.house_code`,
      params,
    );
    const data = rows.map((r: any) => ({
      house_code:   r.house_code,
      house_name:   r.house_name || r.house_code,
      capacity:     r.capacity ?? null,
      house_type:   r.house_type ?? null,
      current_birds: r.current_birds ?? null,
    }));
    return { code: 200, data };
  }

  /**
   * G109：场长在手机端新建本场鸡舍。
   *   farm_code/site_code/company_code 由场长 scope **自动派生**（从同场已有鸡舍复制），
   *   场长不可指定农场 → 杜绝跨场建舍、杜绝建出无映射的孤儿舍。
   *   全局/admin 不走此快捷入口（应在 PC 端鸡舍管理显式指定农场）。
   */
  async createHouse(
    body: { house_code?: string; house_name?: string; capacity?: number; house_type?: string },
    scope: {
      isGlobal: boolean;
      farmCode: string | null;
      siteCode: string | null;
      farmCodes?: string[];
      siteCodes?: string[];
      companyCodes?: string[];
    },
    actor?: { userId?: number | string; roles?: string[] },
  ) {
    if (scope.isGlobal && actor?.roles?.includes('ROLE_FARM_MGR')
      && !actor.roles.some(role => role === 'ROLE_ADMIN' || role === 'ROLE_SUPER_ADMIN')) {
      const bindings = actor.userId == null ? [] : await this.em.query(
        `SELECT o.org_code, o.company_code
           FROM sys_user_orgs uo
           JOIN sys_organizations o ON o.id = uo.org_id
          WHERE uo.user_id = $1
            AND o.status = 'ACTIVE'
            AND o.org_type = 'SITE'
            AND (uo.is_primary = TRUE OR uo.is_manager = TRUE)
          ORDER BY uo.is_primary DESC, o.org_code`,
        [actor.userId],
      );
      const uniqueSites = [...new Map(
        bindings.map((row: any) => [row.org_code, row]),
      ).values()] as Array<{ org_code: string; company_code?: string | null }>;
      if (uniqueSites.length === 1) {
        scope = {
          isGlobal: false,
          farmCode: null,
          siteCode: uniqueSites[0].org_code,
          farmCodes: [],
          siteCodes: [uniqueSites[0].org_code],
          companyCodes: uniqueSites[0].company_code ? [uniqueSites[0].company_code] : [],
        };
      }
    }
    if (scope.isGlobal) {
      throw new Error('集团/管理员请在 PC 端「鸡舍管理」创建并指定农场；手机端仅供场长建本场鸡舍。');
    }
    const code = (body.house_code || '').trim();
    const name = (body.house_name || '').trim();
    if (!code || !name) throw new Error('鸡舍编码和名称必填');

    let farmCodes = [...new Set(
      (scope.farmCodes?.length ? scope.farmCodes : (scope.farmCode ? [scope.farmCode] : []))
        .filter(Boolean),
    )];
    const siteCodes = [...new Set(
      (scope.siteCodes?.length ? scope.siteCodes : (scope.siteCode ? [scope.siteCode] : []))
        .filter(Boolean),
    )];
    const companyCodes = [...new Set((scope.companyCodes ?? []).filter(Boolean))];
    if (farmCodes.length === 0 && siteCodes.length === 0) {
      throw new Error('无法确定您所属农场/场区，请联系管理员配置后再建鸡舍。');
    }
    if (farmCodes.length > 1 || siteCodes.length > 1 || companyCodes.length > 1) {
      throw new Error('当前账号关联多个农场或公司，请在 PC 端明确选择归属后创建鸡舍。');
    }

    if (farmCodes.length === 0 && siteCodes.length === 1) {
      farmCodes = await this.ownership.resolveFarmCodesBySiteCodes(siteCodes);
      if (farmCodes.length !== 1) {
        throw new Error('SITE 尚未映射唯一农场，请联系管理员完成组织投影映射。');
      }
    }

    const farmCode = farmCodes[0] || null;
    if (!farmCode) throw new Error('SITE 尚未映射唯一农场，请联系管理员完成组织投影映射。');
    const resolved = await this.ownership.resolveFarm(farmCode);
    if (companyCodes.length > 0 && !companyCodes.includes(resolved.companyCode)) {
      throw new Error('农场与公司范围不一致，已拒绝创建鸡舍。');
    }
    if (siteCodes.length > 0 && (!resolved.siteCode || !siteCodes.includes(resolved.siteCode))) {
      throw new Error('农场与 SITE 投影不一致，已拒绝创建鸡舍。');
    }
    const siteCode = resolved.siteCode || null;
    const companyCode = resolved.companyCode;
    const farmName = resolved.farmName || null;

    const dup = await this.em.query(`SELECT 1 FROM brd_houses WHERE house_code = $1`, [code]);
    if (dup.length) throw new Error(`鸡舍编码「${code}」已存在`);

    await this.em.query(
      `INSERT INTO brd_houses
         (house_code, house_name, farm_code, farm_name,
          house_type, capacity, current_birds, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,'ACTIVE',NOW())`,
      [code, name, farmCode, farmName,
       body.house_type || '蛋鸡舍', Number(body.capacity) || 0],
    );
    return { code: 200, data: { house_code: code, farm_code: farmCode, site_code: siteCode, company_code: companyCode } };
  }

  // ── 工具 ──────────────────────────────────────────────────────────────────────
  private formatRow(r: any) {
    const prevStock    = Number(r.prev_stock    ?? 0);
    const inboundQty   = Number(r.inbound_qty   ?? 0);
    const outboundTotal = Number(r.outbound_total ?? 0);
    const dailyUsage   = Number(r.daily_usage   ?? 0);
    const currentStock = prevStock + inboundQty - outboundTotal;
    const daysLeft     = dailyUsage > 0 ? Math.floor(currentStock / dailyUsage) : null;
    return {
      id:              r.id,
      ledger_date:     r.ledger_date,
      material_name:   r.material_name,
      unit:            r.unit,
      sort_order:      r.sort_order,
      prev_stock:      prevStock,
      inbound_qty:     inboundQty,
      outbound_detail: r.outbound_detail ?? {},
      outbound_total:  outboundTotal,
      current_stock:   currentStock < 0 ? 0 : currentStock,
      daily_usage:     dailyUsage,
      days_left:       daysLeft,
      alert:           daysLeft !== null && daysLeft <= 7 ? (daysLeft <= 3 ? 'CRITICAL' : 'WARN') : null,
      note:            r.note ?? '',
    };
  }

  private prevDay(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
}
