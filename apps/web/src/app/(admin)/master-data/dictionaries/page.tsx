"use client";

/**
 * 数据字典中心 — UIX-PROD-1 产品化重构
 *
 * 视角从"数据库浏览器"改为"业务字典平台"：
 *   顶部：5 张运营 KPI（字典总数 / 业务分类数 / 启用 / 停用 / 待审批）
 *   中部：6 个业务分类导航（组织 / 财务 / 销售 / 库存 / 生产 / 流程）
 *   底部：当前分类下的字典明细列表（默认全部分类）
 *
 * 数据源：GET /api/crud/sys_dict?limit=500（沿用现有 CRUD 接口）
 * 业务分类映射在 BIZ_CATEGORY 中维护，按 dict_type 前缀归类。
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen, Search, RefreshCw, Network, Wallet, ShoppingCart,
  Warehouse, Factory, GitBranch, Layers, CheckCircle2, Clock,
  Snowflake, Database,
} from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from '@/components/ui/admin-ui.module.css'; // G29-B

interface DictRow {
  id?: number;
  dict_code: string;
  dict_type?: string;
  dict_label_zh?: string;
  dict_label_lo?: string;
  dict_label_en?: string;
  sort_no?: number;
  status?: string;
}

// ── 业务分类（按 dict_type 前缀归类） ────────────────────────────────
interface BizCategory {
  key: string;
  label: string;
  desc: string;
  icon: any;
  accent: string;
  prefixes: string[];
}

const BIZ_CATEGORIES: BizCategory[] = [
  { key: 'org', label: '组织治理', desc: '组织层级 / 角色 / 审批方向',
    icon: Network, accent: 'var(--color-primary)',
    prefixes: ['SYS_ORG', 'SYS_ROLE', 'SYS_USER', 'APPROVAL'] },
  { key: 'fin', label: '财务结算', desc: '币种 / 付款方式 / 资金性质 / 费用类型',
    icon: Wallet, accent: 'var(--status-info)',
    prefixes: ['FIN', 'SYS_CURRENCY', 'SYS_PAYMENT'] },
  { key: 'sales', label: '销售流通', desc: '订单类型 / 渠道 / 配送 / 退货',
    icon: ShoppingCart, accent: 'var(--status-success)',
    prefixes: ['SAL', 'STORE', 'POS'] },
  { key: 'wms', label: '仓储库存', desc: '出入库类型 / 报损 / 调拨 / 批次状态',
    icon: Warehouse, accent: 'var(--status-warning)',
    prefixes: ['WMS', 'INV'] },
  { key: 'prod', label: '生产质检', desc: '生产类型 / 缺陷 / 不合格处置 / 饲料',
    icon: Factory, accent: 'var(--color-purple-500)',
    prefixes: ['PRC', 'QA', 'FARM', 'BRD', 'FEED', 'PKG'] },
  { key: 'flow', label: '流程协同', desc: '审批类型 / 通知 / 工作流标签',
    icon: GitBranch, accent: 'var(--color-accent)',
    prefixes: ['WF', 'NOTIFY', 'MENU'] },
];

const FALLBACK_CATEGORY: BizCategory = {
  key: 'misc', label: '其他', desc: '未归类业务字典',
  icon: Layers, accent: 'var(--text-secondary)', prefixes: [],
};

function classify(dictType: string): BizCategory {
  for (const c of BIZ_CATEGORIES) {
    if (c.prefixes.some(p => dictType.startsWith(p))) return c;
  }
  return FALLBACK_CATEGORY;
}

// ── 业务化标签覆盖：把 dict_type 翻译为业务语言 ──────────────────────
// 全量 67 个 dict_type → 中文（与生产 sys_dict 对齐，2026-06-10 校准）。
// 前台禁露英文裸码；漏网类型走 typeLabel() 的前缀兜底。
const TYPE_LABEL_MAP: Record<string, string> = {
  APR_MODULE_TYPE: "审批模块类型",
  BRD_BREED: "品种", BRD_BREED_TYPE: "品种类型", BRD_CULLING_REASON: "淘汰原因",
  BRD_FLOCK_STATUS: "鸡群状态", BRD_HOUSE_TYPE: "鸡舍类型", BRD_MORTALITY_REASON: "死亡原因",
  BRD_SHIFT: "养殖班次", BRD_VACCINATE_METHOD: "免疫接种方式", BRD_VACCINE_TYPE: "疫苗类型",
  BS_CUSTOMER_LEVEL: "客户等级", BS_PAYMENT_TERM: "付款条件",
  CRM_ACTIVITY_TYPE: "营销活动类型", CRM_COUPON_LEVEL: "优惠券层级", CRM_COUPON_TYPE: "优惠券类型",
  CRM_MEMBER_LEVEL: "会员等级", CRM_TARGET_GROUP: "目标客群",
  FIN_CONTRIBUTION_TYPE: "出资类型", FIN_EXPENSE_TYPE: "费用类型", FIN_FUND_NATURE: "资金性质",
  FIN_PAYER_TYPE: "付款方类型", FIN_RECEIPT_METHOD: "收款方式",
  INV_COUNT_TYPE: "盘点类型", INV_INBOUND_TYPE: "入库类型", INV_LOSS_REASON: "库存损耗原因",
  INV_OUTBOUND_DEST_TYPE: "出库目的地类型", INV_OUTBOUND_TYPE: "出库类型",
  INV_STOCK_STATUS: "库存状态", INV_TRANSFER_REASON: "调拨原因",
  PKG_ANOMALY_REASON: "包装异常原因", PKG_CUSTOM_LABEL: "自定义标签", PKG_DEFECT: "包装缺陷",
  PKG_EGG_DEFECT: "蛋品缺陷类型", PKG_EXCEPTION_TYPE: "包装异常类型", PKG_PACK_LINE: "包装线",
  PKG_PACK_SPEC: "包装规格", PKG_PRESORT_STANDARD: "预分级标准", PKG_QC_RESULT: "包装质检结果",
  PKG_SHIFT: "包装班次",
  PRC_PAYMENT_METHOD: "采购付款方式", PRC_PURCHASE_TYPE: "采购类型",
  PRC_QUALITY_STATUS: "采购质量状态", PRC_URGENCY: "采购紧急度",
  PRD_PRODUCT_GRADE: "产品等级（旧）", PRD_PRODUCT_TYPE: "产品类型",
  QC_INSPECT_CATEGORY: "质检类别", QC_INSPECT_TYPE: "质检类型", QC_NC_SOURCE: "不合格来源",
  QC_PRODUCT_CATEGORY: "质检产品类别", QC_TRACE_TYPE: "追溯类型",
  SAL_CHANNEL: "销售渠道", SAL_CUSTOMER_TYPE: "客户类型", SAL_DELIVERY_EXCEPTION: "配送异常",
  SAL_FULFILLMENT_TYPE: "履约方式", SAL_ORDER_TYPE: "订单类型", SAL_PAY_METHOD: "销售收款方式",
  SAL_PRICE_TYPE: "价格类型", SAL_RETURN_REASON: "退货原因", SAL_SETTLEMENT_METHOD: "结算方式",
  SYS_COUNTRY: "国家/地区", SYS_CURRENCY: "币种", SYS_ORG_LEVEL: "组织层级",
  TRP_EXCEPTION_TYPE: "运输异常类型", TRP_RECEIPT_STATUS: "签收状态",
  VET_USAGE: "用药方式",
  WMS_INBOUND_TYPE: "入库类型（仓储）", WMS_OUTBOUND_TYPE: "出库类型（仓储）",
};

// 前缀域兜底：任何未登记类型也按业务域显示中文，绝不露英文裸码
const PREFIX_DOMAIN: Record<string, string> = {
  APR: "审批", APPROVAL: "审批", BRD: "养殖", BS: "商务", CRM: "会员营销", FIN: "财务",
  INV: "库存", PKG: "包装", PRC: "采购", PRD: "产品", QC: "质检", QA: "质检", SAL: "销售",
  SYS: "系统", TRP: "运输", VET: "兽医", WMS: "仓储", FARM: "养殖", STORE: "门店", FEED: "饲料",
};
function typeLabel(t: string): string {
  if (TYPE_LABEL_MAP[t]) return TYPE_LABEL_MAP[t];
  const domain = PREFIX_DOMAIN[(t.split("_")[0] || "")];
  return domain ? `${domain}·${t.split("_").slice(1).join("")}` : t;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: '启用',   color: 'var(--status-success)', bg: 'var(--status-success-bg-light)' },
  INACTIVE:  { label: '停用',   color: 'var(--text-secondary)', bg: 'var(--bg-muted)' },
  PENDING:   { label: '待审批', color: 'var(--status-warning)', bg: 'var(--status-warning-bg-light)' },
};

const tok = () => typeof window !== "undefined"
  ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
  : "";

export default function MdDictionariesPage() {
  const { canView } = usePermission("MENU_SETTINGS_DATA");
  const [items, setItems] = useState<DictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>('');  // '' = 全部

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/crud/sys_dict?limit=500", {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : data.rows ?? data.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // ── 业务统计 ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length;
    const types = new Set(items.map(d => d.dict_type ?? ''));
    const active = items.filter(d => (d.status ?? 'ACTIVE') === 'ACTIVE').length;
    const inactive = items.filter(d => d.status === 'INACTIVE').length;
    const pending = items.filter(d => d.status === 'PENDING').length;
    return { total, typeCount: types.size, active, inactive, pending };
  }, [items]);

  // ── 业务分类聚合 ──────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const map: Record<string, { items: number; types: Set<string> }> = {};
    for (const d of items) {
      const cat = classify(d.dict_type ?? '');
      if (!map[cat.key]) map[cat.key] = { items: 0, types: new Set() };
      map[cat.key].items += 1;
      map[cat.key].types.add(d.dict_type ?? '');
    }
    return map;
  }, [items]);

  // ── 过滤后字典明细 ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return items.filter(d => {
      if (activeCategory && classify(d.dict_type ?? '').key !== activeCategory) return false;
      if (search) {
        const kw = search.toLowerCase();
        const ok =
          (d.dict_code ?? '').toLowerCase().includes(kw) ||
          (d.dict_label_zh ?? '').toLowerCase().includes(kw) ||
          (d.dict_type ?? '').toLowerCase().includes(kw) ||
          typeLabel(d.dict_type ?? '').toLowerCase().includes(kw);
        if (!ok) return false;
      }
      return true;
    });
  }, [items, search, activeCategory]);

  // 按 dict_type 分组（用业务标签命名 group）
  const grouped = useMemo(() => {
    const byType: Record<string, DictRow[]> = {};
    for (const d of filtered) {
      const t = d.dict_type ?? '未分类';
      (byType[t] ?? (byType[t] = [])).push(d);
    }
    return Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (!canView) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>无权限查看字典中心</div>;
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      <PageHeader
        title="数据字典中心"
        subtitle="集团业务枚举的统一来源 · 按业务域组织 · 服务全模块表单与流程"
        breadcrumb={["主数据中心", "数据字典中心"]}
        actions={
          <button onClick={load} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
        }
      />

      {/* ── Phase 1: 5 张运营 KPI ───────────────────────────────── */}
      <div style={kpiGridStyle}>
        <KpiCard label="字典总数"   value={stats.total}      icon={<BookOpen size={14} />} suffix="条" />
        <KpiCard label="业务分类"   value={stats.typeCount}  icon={<Layers size={14} />}   suffix="类" />
        <KpiCard label="启用中"     value={stats.active}     icon={<CheckCircle2 size={14} />} suffix="条" tone="success" />
        <KpiCard label="停用"       value={stats.inactive}   icon={<Snowflake size={14} />} suffix="条" tone="warning" />
        <KpiCard label="待审批"     value={stats.pending}    icon={<Clock size={14} />} suffix="条" tone={stats.pending > 0 ? 'warning' : 'default'} />
      </div>

      {/* ── Phase 2: 业务分类导航 ────────────────────────────────── */}
      <div style={categoryGridStyle}>
        <CategoryTile
          active={activeCategory === ''}
          accent="var(--text-primary)"
          icon={Database}
          label="全部字典"
          desc={`覆盖 ${stats.typeCount} 类业务枚举`}
          itemCount={stats.total}
          typeCount={stats.typeCount}
          onClick={() => setActiveCategory('')}
        />
        {BIZ_CATEGORIES.map(c => {
          const stat = categoryCounts[c.key] ?? { items: 0, types: new Set() };
          return (
            <CategoryTile key={c.key}
              active={activeCategory === c.key}
              accent={c.accent}
              icon={c.icon}
              label={c.label}
              desc={c.desc}
              itemCount={stat.items}
              typeCount={stat.types.size}
              onClick={() => setActiveCategory(c.key)}
            />
          );
        })}
      </div>

      {/* 搜索 + 列表头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '0 0 320px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索字典码 / 中文标签 / 业务名"
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          共 <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> 条 ·
          <strong style={{ color: 'var(--text-primary)', marginLeft: 4 }}>{grouped.length}</strong> 类
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/settings/dict" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'var(--color-primary)', color: 'var(--text-on-dark)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          ✎ 编辑字典 →
        </Link>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: 'var(--status-danger-bg-faint)', color: 'var(--status-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Phase 3: 字典明细分组 ───────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
      ) : grouped.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 8 }}>
          当前条件下无字典
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(([type, rows]) => {
            const bizLabel = typeLabel(type);
            const cat = classify(type);
            return (
              <section key={type} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)' }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                  <cat.icon size={14} color={cat.accent} />
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{bizLabel}</strong>
                  <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{type}</code>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{rows.length} 项</span>
                </header>
                <table className={s.table}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)' }}>
                      <th style={cellHeadStyle}>编码</th>
                      <th style={cellHeadStyle}>名称</th>
                      <th style={{ ...cellHeadStyle, textAlign: 'center', width: 60 }}>排序</th>
                      <th style={{ ...cellHeadStyle, textAlign: 'center', width: 80 }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.sort((a, b) => (a.sort_no ?? 0) - (b.sort_no ?? 0)).map(r => {
                      const st = STATUS_META[r.status ?? 'ACTIVE'] ?? STATUS_META.ACTIVE;
                      return (
                        <tr key={`${type}-${r.dict_code}`} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={cellStyle}><code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.dict_code}</code></td>
                          <td style={{ ...cellStyle, color: 'var(--text-primary)', fontWeight: 500 }}>{r.dict_label_zh ?? '—'}</td>
                          <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.sort_no ?? 0}</td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 子组件 ──────────────────────────────────────────────

function KpiCard({ label, value, icon, suffix, tone = 'default' }: {
  label: string; value: number | string; icon: React.ReactNode;
  suffix?: string; tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const color = tone === 'success' ? 'var(--status-success)'
              : tone === 'warning' ? 'var(--status-warning)'
              : tone === 'danger'  ? 'var(--status-danger)'
              : 'var(--text-primary)';
  return (
    <div style={kpiCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        {icon}<span style={{ fontSize: 11 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}{suffix && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function CategoryTile({ active, accent, icon: Icon, label, desc, itemCount, typeCount, onClick }: {
  active: boolean; accent: string; icon: any; label: string; desc: string;
  itemCount: number; typeCount: number; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 14,
        background: active ? 'var(--bg-muted)' : 'var(--bg-card)',
        border: `1px solid ${active ? accent : 'var(--border)'}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'all 0.15s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={16} color={accent} />
        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</strong>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <strong style={{ fontSize: 18, color: accent, fontWeight: 700 }}>{itemCount}</strong>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>项 · {typeCount} 类</span>
      </div>
    </button>
  );
}

// ── 样式 ────────────────────────────────────────────────

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 12,
  marginBottom: 16,
};

const kpiCardStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 76,
};

const categoryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  marginBottom: 18,
};

const cellHeadStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--text-primary)',
};
