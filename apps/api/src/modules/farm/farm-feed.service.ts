import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

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
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

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
  async getHouses(farmCode?: string, siteCode?: string) {
    const params: any[] = [];
    let where = `WHERE status = 'ACTIVE'`;
    if (farmCode) {
      params.push(farmCode);
      where += ` AND farm_code = $${params.length}`;
    }
    if (siteCode) {
      params.push(siteCode);
      where += ` AND site_code = $${params.length}`;
    }
    // G109：返回 house_code + 中文 house_name（手机端显示中文名、以 code 为数据键）。
    //   去掉 DEFAULT_HOUSES 硬编码兜底——无数据即返回空(提示去建鸡舍)，杜绝第三套漂移名。
    const rows = await this.em.query(
      `SELECT house_code, house_name FROM brd_houses ${where} ORDER BY house_code`,
      params,
    );
    const data = rows.map((r: any) => ({
      house_code: r.house_code,
      house_name: r.house_name || r.house_code,
    }));
    return { code: 200, data };
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
