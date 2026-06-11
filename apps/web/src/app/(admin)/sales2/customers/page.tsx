"use client";

import { useState, useCallback, useEffect } from "react";
import u from "@/styles/uix-utils.module.css";
import { Users, Layers, CreditCard, Plus, RefreshCw, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
const API = "/api/v2/sales";

// ── 枚举常量 ──────────────────────────────────────────────────────────────────
const CUSTOMER_TYPES = [{
  value: "DIRECT_STORE",
  label: "直营店"
}, {
  value: "DISTRIBUTOR",
  label: "经销商"
}, {
  value: "AGENT",
  label: "代理商"
}, {
  value: "KEY_ACCOUNT",
  label: "大客户"
}, {
  value: "RETAIL",
  label: "散客零售"
}];
const RISK_LEVELS = [{
  value: "NORMAL",
  label: "正常"
}, {
  value: "WATCH",
  label: "观察"
}, {
  value: "BLACKLIST",
  label: "黑名单"
}];
const STATUS_MAP: Record<string, {
  label: string;
  cls: string;
}> = {
  ACTIVE: {
    label: "正常",
    cls: s.badgeSuccess
  },
  FROZEN: {
    label: "冻结",
    cls: s.badgeWarning
  },
  BLACKLIST: {
    label: "黑名单",
    cls: s.badgeDanger ?? s.badgeNeutral
  }
};
const CHANNEL_TYPES = [{
  value: "DIRECT",
  label: "直营"
}, {
  value: "DISTRIBUTOR",
  label: "经销"
}, {
  value: "AGENT",
  label: "代理"
}, {
  value: "RETAIL",
  label: "零售"
}];
const CHANNEL_STATUS_MAP: Record<string, {
  label: string;
  cls: string;
}> = {
  ACTIVE: {
    label: "启用",
    cls: s.badgeSuccess
  },
  INACTIVE: {
    label: "停用",
    cls: s.badgeNeutral
  }
};

// ── API helpers ───────────────────────────────────────────────────────────────
function getToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
async function apiFetch(path: string, options?: RequestInit) {
  // 修复（401 踢登录）：原 apiFetch 未携带 Authorization 头，API 鉴权失败返回 401，
  // 前端按"登录过期"跳回登录页。这里补上 Bearer token，并保证 options.headers 不覆盖它。
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options?.headers ?? {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Tab IDs ───────────────────────────────────────────────────────────────────
type Tab = "customers" | "channels" | "credit";
export default function SalesV2CustomersPage() {
  const {
    t
  } = useLanguage();
  const [tab, setTab] = useState<Tab>("customers");
  return <div className="animate-fade-in">
      <PageHeader title="客户档案" subtitle="统一客户主档 · 渠道管理 · 按公司隔离数据" breadcrumb={["销售系统", "客户档案"]} />

      {/* Tab Bar */}
      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "1px solid var(--border)",
      paddingBottom: 0
    }}>
        {([{
        id: "customers",
        label: "客户主档",
        icon: <Users size={14} />
      }, {
        id: "channels",
        label: "渠道管理",
        icon: <Layers size={14} />
      }, {
        id: "credit",
        label: "信用概览",
        icon: <CreditCard size={14} />
      }] as {
        id: Tab;
        label: string;
        icon: React.ReactNode;
      }[]).map(({
        id,
        label,
        icon
      }) => <button key={id} type="button" onClick={() => setTab(id)} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: tab === id ? "var(--color-primary)" : "var(--text-secondary)",
        borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
        marginBottom: -1
      }}>
            {icon}{label}
          </button>)}
      </div>

      {tab === "customers" && <CustomersTab />}
      {tab === "channels" && <ChannelsTab />}
      {tab === "credit" && <CreditTab />}
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 客户主档 Tab
// ══════════════════════════════════════════════════════════════════════════════
function CustomersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmFn, setConfirmFn] = useState<() => Promise<void>>(() => async () => {});
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (keyword) params.set("keyword", keyword);
      if (typeFilter) params.set("customerType", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch(`${API}/customers?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, typeFilter, statusFilter]);
  useEffect(() => {
    load();
  }, [load]);
  const openNew = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (row: any) => {
    setEditing(row);
    setDrawerOpen(true);
  };
  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/customers/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
      } else {
        await apiFetch(`${API}/customers`, {
          method: "POST",
          body: JSON.stringify(values)
        });
      }
      setDrawerOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };
  const askConfirm = (msg: string, fn: () => Promise<void>) => {
    setConfirmMsg(msg);
    setConfirmFn(() => fn);
    setConfirmOpen(true);
  };
  const doFreeze = (row: any) => askConfirm(`冻结客户「${row.customer_name}」？`, async () => {
    await apiFetch(`${API}/customers/${row.id}/freeze`, {
      method: "POST",
      body: "{}"
    });
    load();
  });
  const doActivate = (row: any) => askConfirm(`解冻客户「${row.customer_name}」？`, async () => {
    await apiFetch(`${API}/customers/${row.id}/activate`, {
      method: "POST"
    });
    load();
  });
  const doBlacklist = (row: any) => askConfirm(`将「${row.customer_name}」加入黑名单？此操作需管理员权限。`, async () => {
    await apiFetch(`${API}/customers/${row.id}/blacklist`, {
      method: "POST",
      body: "{}"
    });
    load();
  });
  const FIELDS: FormField[] = [{
    key: "customerName",
    label: "客户名称",
    type: "text",
    required: true
  }, {
    key: "customerType",
    label: "客户类型",
    type: "select",
    required: true,
    options: CUSTOMER_TYPES
  }, {
    key: "companyCode",
    label: "公司",
    type: "company",
    required: true,
    onPickKeys: { companyName: "org_name" }
  }, {
    key: "companyName",
    label: "公司名称",
    type: "readonly"
  }, {
    key: "channelCode",
    label: "渠道",
    type: "channel"
  }, {
    key: "regionCode",
    label: "区域编码",
    type: "text"
  }, {
    key: "creditLimit",
    label: "信用额度",
    type: "number"
  }, {
    key: "paymentTerms",
    label: "账期（天）",
    type: "number"
  }, {
    key: "riskLevel",
    label: "风险等级",
    type: "select",
    options: RISK_LEVELS
  }, {
    key: "salesRepName",
    label: "销售员",
    type: "text"
  }, {
    key: "contactName",
    label: "联系人",
    type: "text"
  }, {
    key: "contactPhone",
    label: "联系电话",
    type: "text"
  }, {
    key: "deliveryAddress",
    label: "配送地址",
    type: "text"
  }, {
    key: "remark",
    label: "备注",
    type: "text"
  }];
  const totalPages = Math.ceil(total / limit);
  return <div>
      {/* Toolbar */}
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 14,
      flexWrap: "wrap"
    }}>
        <div style={{
        position: "relative",
        flex: 1,
        minWidth: 200
      }}>
          <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-secondary)"
        }} />
          <input style={{
          paddingLeft: 32,
          height: 34,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          fontSize: 13,
          width: "100%",
          background: "var(--bg-card)"
        }} placeholder="搜索客户名称 / 编号 / 联系人…" value={keyword} onChange={e => {
          setKeyword(e.target.value);
          setPage(1);
        }} />
          {keyword && <button type="button" onClick={() => {
          setKeyword("");
          setPage(1);
        }} style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer"
        }}><X size={13} /></button>}
        </div>
        <select value={typeFilter} onChange={e => {
        setTypeFilter(e.target.value);
        setPage(1);
      }} style={{
        height: 34,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        padding: "0 10px",
        background: "var(--bg-card)"
      }}>
          <option value="">全部类型</option>
          {CUSTOMER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => {
        setStatusFilter(e.target.value);
        setPage(1);
      }} style={{
        height: 34,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        padding: "0 10px",
        background: "var(--bg-card)"
      }}>
          <option value="">全部状态</option>
          <option value="ACTIVE">正常</option>
          <option value="FROZEN">冻结</option>
          <option value="BLACKLIST">黑名单</option>
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 34
      }}>
          <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> 刷新
        </button>
        {/* G4-C：禁止销售页直接建客户；导向 G3 主数据中心 */}
        <a href="/master-data/customers" className={s.btnPrimary} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 34,
        textDecoration: "none"
      }}>
          <Plus size={13} /> 前往主数据中心新增
        </a>
      </div>

      {/* G4-C：销售视图说明横幅 */}
      <div style={{
      background: "var(--bg-info,var(--status-info-bg-page))",
      border: "1px solid var(--color-info,var(--status-info))",
      borderRadius: "var(--radius-md)",
      padding: "10px 14px",
      marginBottom: 12,
      fontSize: 12.5,
      color: "var(--color-info,var(--color-accent))"
    }}>
        <strong>销售视图：</strong>客户主数据已下沉至 <a href="/master-data/customers" style={{
        color: "inherit",
        fontWeight: 600,
        textDecoration: "underline"
      }}>主数据中心</a>，
        请在主数据中心完成新增/审批/资质上传。本页保留浏览、筛选、信用维度的销售侧扩展信息编辑。
      </div>

      {/* Table */}
      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {["客户编号", "客户名称", "类型", "渠道", "信用额度", "已用额度", "账期", "风险", "状态", "操作"].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className={u.emptyCenter}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={10} className={s.emptyState}>暂无客户数据</td></tr>}
            {rows.map((row, i) => {
            const st = STATUS_MAP[row.status] ?? {
              label: row.status,
              cls: s.badgeNeutral
            };
            const risk = RISK_LEVELS.find(r => r.value === row.risk_level);
            const type = CUSTOMER_TYPES.find(t => t.value === row.customer_type);
            return <tr key={row.id} style={{
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none"
            }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{
                padding: "9px 12px",
                fontFamily: "monospace",
                fontSize: 12
              }}>{row.customer_no}</td>
                  <td style={{
                padding: "9px 12px"
              }}>{row.customer_name}</td>
                  <td style={{
                padding: "9px 12px"
              }}><span className={`${s.badge} ${s.badgeInfo}`}>{type?.label ?? row.customer_type}</span></td>
                  <td style={{
                padding: "9px 12px",
                color: "var(--text-secondary)"
              }}>{row.channel_code ?? "—"}</td>
                  <td style={{
                padding: "9px 12px",
                textAlign: "right"
              }}>{Number(row.credit_limit).toLocaleString()}</td>
                  <td style={{
                padding: "9px 12px",
                textAlign: "right"
              }}>{Number(row.credit_used).toLocaleString()}</td>
                  <td style={{
                padding: "9px 12px",
                textAlign: "center"
              }}>{row.payment_terms}天</td>
                  <td style={{
                padding: "9px 12px"
              }}>
                    <span className={`${s.badge} ${risk?.value === "BLACKLIST" ? s.badgeDanger ?? s.badgeNeutral : risk?.value === "WATCH" ? s.badgeWarning : s.badgeSuccess}`}>
                      {risk?.label ?? row.risk_level}
                    </span>
                  </td>
                  <td style={{
                padding: "9px 12px"
              }}><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td style={{
                padding: "9px 12px"
              }}>
                    <div style={{
                  display: "flex",
                  gap: 4
                }}>
                      <button type="button" className={s.btnSecondary} onClick={() => openEdit(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>编辑</button>
                      {row.status === "ACTIVE" && <button type="button" className={s.btnSecondary} onClick={() => doFreeze(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>冻结</button>}
                      {row.status === "FROZEN" && <button type="button" className={s.btnSecondary} onClick={() => doActivate(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>解冻</button>}
                      {row.status !== "BLACKLIST" && <button type="button" onClick={() => doBlacklist(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    background: "none",
                    border: "1px solid var(--status-danger)",
                    color: "var(--status-danger)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer"
                  }}>
                          黑名单
                        </button>}
                    </div>
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
      alignItems: "center",
      fontSize: 13
    }}>
          <span className={u.muted}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>}

      {/* Drawer */}
      <RightDrawer open={drawerOpen} title={editing ? "编辑客户" : "新建客户"} onClose={() => setDrawerOpen(false)}>
        <CrudForm fields={FIELDS} initialValues={editing ? {
        customerName: editing.customer_name,
        customerType: editing.customer_type,
        companyCode: editing.company_code,
        companyName: editing.company_name,
        channelCode: editing.channel_code,
        regionCode: editing.region_code,
        creditLimit: editing.credit_limit,
        paymentTerms: editing.payment_terms,
        riskLevel: editing.risk_level,
        salesRepName: editing.sales_rep_name,
        contactName: editing.contact_name,
        contactPhone: editing.contact_phone,
        deliveryAddress: editing.delivery_address,
        remark: editing.remark
      } : {}} onSubmit={handleSave} onCancel={() => setDrawerOpen(false)} loading={saving} />
      </RightDrawer>

      {/* Confirm */}
      <ConfirmDialog open={confirmOpen} title="确认操作" message={confirmMsg} onConfirm={async () => {
      await confirmFn();
      setConfirmOpen(false);
    }} onCancel={() => setConfirmOpen(false)} />
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 渠道管理 Tab
// ══════════════════════════════════════════════════════════════════════════════
function ChannelsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (keyword) params.set("keyword", keyword);
      const res = await apiFetch(`${API}/channels?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, keyword]);
  useEffect(() => {
    load();
  }, [load]);
  const openNew = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (row: any) => {
    setEditing(row);
    setDrawerOpen(true);
  };
  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/channels/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
      } else {
        await apiFetch(`${API}/channels`, {
          method: "POST",
          body: JSON.stringify(values)
        });
      }
      setDrawerOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };
  const toggleStatus = async (row: any) => {
    const action = row.status === "ACTIVE" ? "deactivate" : "activate";
    await apiFetch(`${API}/channels/${row.id}/${action}`, {
      method: "POST"
    });
    load();
  };
  const FIELDS: FormField[] = [{
    key: "channelCode",
    label: "渠道编码",
    type: "text",
    required: true,
    placeholder: "唯一编码，如 CH-DIRECT-001"
  }, {
    key: "channelName",
    label: "渠道名称",
    type: "text",
    required: true
  }, {
    key: "channelType",
    label: "渠道类型",
    type: "select",
    required: true,
    options: CHANNEL_TYPES
  }, {
    key: "companyCode",
    label: "公司编码",
    type: "text",
    required: true
  }, {
    key: "companyName",
    label: "公司名称",
    type: "text"
  }, {
    key: "remark",
    label: "备注",
    type: "text"
  }];
  const totalPages = Math.ceil(total / limit);
  return <div>
      {/* Toolbar */}
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 14
    }}>
        <div style={{
        position: "relative",
        flex: 1,
        minWidth: 200
      }}>
          <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-secondary)"
        }} />
          <input style={{
          paddingLeft: 32,
          height: 34,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          fontSize: 13,
          width: "100%",
          background: "var(--bg-card)"
        }} placeholder="搜索渠道名称 / 编码…" value={keyword} onChange={e => {
          setKeyword(e.target.value);
          setPage(1);
        }} />
        </div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 34
      }}>
          <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> 刷新
        </button>
        <button type="button" className={s.btnPrimary} onClick={openNew} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 34
      }}>
          <Plus size={13} /> 新建渠道
        </button>
      </div>

      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {["渠道编码", "渠道名称", "类型", "公司", "状态", "操作"].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className={u.emptyCenter}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className={s.emptyState}>暂无渠道数据</td></tr>}
            {rows.map((row, i) => {
            const st = CHANNEL_STATUS_MAP[row.status] ?? {
              label: row.status,
              cls: s.badgeNeutral
            };
            const ct = CHANNEL_TYPES.find(t => t.value === row.channel_type);
            return <tr key={row.id} style={{
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none"
            }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{
                padding: "9px 12px",
                fontFamily: "monospace",
                fontSize: 12
              }}>{row.channel_code}</td>
                  <td style={{
                padding: "9px 12px",
                fontWeight: 600
              }}>{row.channel_name}</td>
                  <td style={{
                padding: "9px 12px"
              }}><span className={`${s.badge} ${s.badgeInfo}`}>{ct?.label ?? row.channel_type}</span></td>
                  <td style={{
                padding: "9px 12px",
                color: "var(--text-secondary)"
              }}>{row.company_code}</td>
                  <td style={{
                padding: "9px 12px"
              }}><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td style={{
                padding: "9px 12px"
              }}>
                    <div style={{
                  display: "flex",
                  gap: 4
                }}>
                      <button type="button" className={s.btnSecondary} onClick={() => openEdit(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>编辑</button>
                      <button type="button" className={s.btnSecondary} onClick={() => toggleStatus(row)} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>
                        {row.status === "ACTIVE" ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
      alignItems: "center",
      fontSize: 13
    }}>
          <span className={u.muted}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>}

      <RightDrawer open={drawerOpen} title={editing ? "编辑渠道" : "新建渠道"} onClose={() => setDrawerOpen(false)}>
        <CrudForm fields={FIELDS} initialValues={editing ? {
        channelCode: editing.channel_code,
        channelName: editing.channel_name,
        channelType: editing.channel_type,
        companyCode: editing.company_code,
        companyName: editing.company_name,
        remark: editing.remark
      } : {}} onSubmit={handleSave} onCancel={() => setDrawerOpen(false)} loading={saving} />
      </RightDrawer>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 信用分析 Tab  (Phase 5 完整版)
// ══════════════════════════════════════════════════════════════════════════════

const CREDIT_STATUS_CFG: Record<string, {
  label: string;
  color: string;
  bg: string;
}> = {
  NORMAL: {
    label: "正常",
    color: "var(--status-success)",
    bg: "var(--status-success-bg-light)"
  },
  WARNING: {
    label: "预警",
    color: "var(--status-warning)",
    bg: "var(--status-warning-bg-light)"
  },
  OVER_LIMIT: {
    label: "超额度",
    color: "var(--status-danger)",
    bg: "var(--status-danger-bg-light)"
  },
  OVERDUE: {
    label: "逾期",
    color: "var(--status-danger)",
    bg: "rgba(220,38,38,0.12)"
  },
  FROZEN: {
    label: "冻结",
    color: "var(--gray-500)",
    bg: "rgba(107,114,128,0.12)"
  }
};
function CreditTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [creditFilter, setCreditFilter] = useState<"" | "overdue" | "high-risk">("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // 右侧分析面板
  const [selected, setSelected] = useState<any | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [anaLoading, setAnaLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [unfreezing, setUnfreezing] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res: any;
      if (creditFilter === "overdue") {
        const p = new URLSearchParams({
          page: String(page),
          limit: String(limit)
        });
        if (keyword) p.set("keyword", keyword);
        res = await apiFetch(`${API}/credit/overdue-customers?${p}`);
      } else if (creditFilter === "high-risk") {
        const p = new URLSearchParams({
          page: String(page),
          limit: String(limit)
        });
        if (keyword) p.set("keyword", keyword);
        res = await apiFetch(`${API}/credit/high-risk-customers?${p}`);
      } else {
        const p = new URLSearchParams({
          page: String(page),
          limit: String(limit)
        });
        if (keyword) p.set("keyword", keyword);
        res = await apiFetch(`${API}/customers?${p}`);
      }
      setRows(res.data ?? []);
      setTotal(Number(res.total ?? 0));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, creditFilter]);
  useEffect(() => {
    load();
  }, [load]);
  const openAnalysis = async (row: any) => {
    setSelected(row);
    setAnalysis(null);
    setAnaLoading(true);
    try {
      const data = await apiFetch(`${API}/customers/${row.id}/credit-analysis`);
      setAnalysis(data);
    } catch {
      setAnalysis(null);
    } finally {
      setAnaLoading(false);
    }
  };
  const doRefresh = async (row: any) => {
    setRefreshing(row.id);
    try {
      await apiFetch(`${API}/customers/${row.id}/refresh-credit`, {
        method: "POST"
      });
      await load();
      if (selected?.id === row.id) await openAnalysis({
        ...row
      });
    } catch {} finally {
      setRefreshing(null);
    }
  };
  const doUnfreeze = async (row: any) => {
    setUnfreezing(row.id);
    try {
      await apiFetch(`${API}/customers/${row.id}/unfreeze`, {
        method: "POST"
      });
      await load();
      if (selected?.id === row.id) setSelected(null);
    } catch {} finally {
      setUnfreezing(null);
    }
  };
  const totalPages = Math.ceil(total / limit);
  return <div style={{
    display: "grid",
    gridTemplateColumns: selected ? "1fr 360px" : "1fr",
    gap: 16,
    alignItems: "start"
  }}>
      {/* 左侧列表 */}
      <div>
        {/* 工具栏 */}
        <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 14,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
          {/* 快捷筛选标签 */}
          {([["", "全部客户"], ["overdue", "⚠ 逾期客户"], ["high-risk", "● 高风险客户"]] as [typeof creditFilter, string][]).map(([f, lbl]) => <button key={f} type="button" onClick={() => {
          setCreditFilter(f);
          setPage(1);
          setSelected(null);
        }} style={{
          padding: "5px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          border: `1px solid ${creditFilter === f ? "var(--color-primary)" : "var(--border)"}`,
          background: creditFilter === f ? "var(--color-primary)" : "transparent",
          color: creditFilter === f ? "var(--bg-card)" : "var(--text-secondary)"
        }}>
              {lbl}
            </button>)}
          <div style={{
          position: "relative",
          flex: 1,
          minWidth: 160
        }}>
            <Search size={13} style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-secondary)"
          }} />
            <input style={{
            paddingLeft: 28,
            height: 32,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            width: "100%",
            background: "var(--bg-card)"
          }} placeholder="搜索客户名称…" value={keyword} onChange={e => {
            setKeyword(e.target.value);
            setPage(1);
          }} />
          </div>
          <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 32,
          padding: "0 12px",
          fontSize: 12
        }}>
            <RefreshCw size={12} style={{
            animation: loading ? "spin 1s linear infinite" : "none"
          }} /> 刷新
          </button>
        </div>

        {/* 表格 */}
        <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden"
      }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["客户名称", "信用状态", "信用额度", "实时欠款", "可用额度", "逾期金额", "账期(天)", "操作"].map(h => <th key={h} style={{
                textAlign: ["信用额度", "实时欠款", "可用额度", "逾期金额"].includes(h) ? "right" : ["账期(天)"].includes(h) ? "center" : "left",
                whiteSpace: "nowrap"
              }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className={u.emptyCenter}>加载中…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className={u.emptyCenter}>暂无数据</td></tr>}
              {rows.map((row, i) => {
              const cs = CREDIT_STATUS_CFG[row.credit_status ?? "NORMAL"] ?? CREDIT_STATUS_CFG.NORMAL;
              const lim = Number(row.credit_limit ?? 0);
              const used = Number(row.credit_used ?? 0);
              const avail = lim - used;
              const overdue = Number(row.overdue_amount ?? 0);
              const isSelected = selected?.id === row.id;
              return <tr key={row.id} style={{
                cursor: "pointer",
                background: isSelected ? "rgba(var(--color-primary-rgb),0.06)" : undefined
              }} onMouseEnter={e => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              }} onMouseLeave={e => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "";
              }} onClick={() => openAnalysis(row)}>
                    <td>
                      {row.customer_name}
                      {row.auto_frozen && <span style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: "var(--gray-500)",
                    background: "rgba(107,114,128,0.1)",
                    padding: "1px 5px",
                    borderRadius: 8,
                    fontWeight: 400
                  }}>自动冻结</span>}
                    </td>
                    <td>
                      <span style={{
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: cs.bg,
                    color: cs.color
                  }}>{cs.label}</span>
                    </td>
                    <td style={{
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 11
                }}>{lim > 0 ? lim.toLocaleString() : "—"}</td>
                    <td style={{
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: used > 0 ? "var(--status-warning)" : "var(--text-secondary)",
                  fontWeight: used > 0 ? 700 : 400
                }}>
                      {used > 0 ? used.toLocaleString() : "0"}
                    </td>
                    <td style={{
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  color: avail < 0 ? "var(--status-danger)" : avail < lim * 0.1 ? "var(--status-warning)" : "var(--status-success)"
                }}>
                      {avail.toLocaleString()}
                    </td>
                    <td style={{
                  textAlign: "right",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: overdue > 0 ? "var(--status-danger)" : "var(--text-secondary)",
                  fontWeight: overdue > 0 ? 700 : 400
                }}>
                      {overdue > 0 ? overdue.toLocaleString() : "—"}
                    </td>
                    <td className={u.tac}>{row.payment_terms ?? 0}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{
                    display: "flex",
                    gap: 4
                  }}>
                        <button type="button" className={s.btnSecondary} style={{
                      padding: "2px 7px",
                      fontSize: 10
                    }} disabled={refreshing === row.id} onClick={() => doRefresh(row)}>
                          {refreshing === row.id ? "…" : "刷新"}
                        </button>
                        {row.status === "FROZEN" && row.auto_frozen && <button type="button" style={{
                      padding: "2px 7px",
                      fontSize: 10,
                      background: "none",
                      border: "1px solid var(--status-success)",
                      color: "var(--status-success)",
                      borderRadius: "var(--radius)",
                      cursor: "pointer"
                    }} disabled={unfreezing === row.id} onClick={() => doUnfreeze(row)}>
                            {unfreezing === row.id ? "…" : "解冻"}
                          </button>}
                      </div>
                    </td>
                  </tr>;
            })}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 12,
        alignItems: "center",
        fontSize: 12
      }}>
            <span className={u.muted}>共 {total} 条</span>
            <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>}
      </div>

      {/* 右侧信用分析面板 */}
      {selected && <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      position: "sticky",
      top: 16
    }}>
          <div className={u.flexBetween}>
            <div style={{
          fontWeight: 700,
          fontSize: 14
        }}>信用分析</div>
            <button type="button" onClick={() => setSelected(null)} style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: 18,
          lineHeight: 1
        }}>×</button>
          </div>
          <div style={{
        fontWeight: 600,
        fontSize: 13,
        color: "var(--text-primary)"
      }}>{selected.customer_name}</div>

          {anaLoading && <div style={{
        textAlign: "center",
        padding: 32,
        color: "var(--text-secondary)",
        fontSize: 12
      }}>分析中…</div>}

          {!anaLoading && analysis && (() => {
        const cs = CREDIT_STATUS_CFG[analysis.creditStatus ?? "NORMAL"] ?? CREDIT_STATUS_CFG.NORMAL;
        return <>
                {/* 状态徽章 */}
                <div style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap"
          }}>
                  <span style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: cs.bg,
              color: cs.color
            }}>{cs.label}</span>
                  {analysis.riskLevel && analysis.riskLevel !== "NORMAL" && <span style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: "var(--status-danger-bg-light)",
              color: "var(--status-danger)"
            }}>
                      风险：{analysis.riskLevel}
                    </span>}
                </div>

                {/* 数据卡片 grid */}
                <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8
          }}>
                  {[{
              label: "信用额度",
              val: Number(analysis.creditLimit).toLocaleString(),
              color: undefined
            }, {
              label: "实时欠款",
              val: Number(analysis.totalReceivable).toLocaleString(),
              color: analysis.totalReceivable > 0 ? "var(--status-warning)" : undefined
            }, {
              label: "可用额度",
              val: Number(analysis.creditAvailable).toLocaleString(),
              color: analysis.creditAvailable < 0 ? "var(--status-danger)" : "var(--status-success)"
            }, {
              label: "逾期金额",
              val: analysis.overdueReceivable > 0 ? Number(analysis.overdueReceivable).toLocaleString() : "无",
              color: analysis.overdueReceivable > 0 ? "var(--status-danger)" : "var(--status-success)"
            }, {
              label: "账期",
              val: `${analysis.paymentTerms ?? 0} 天`,
              color: undefined
            }, {
              label: "逾期天数",
              val: analysis.overdueDays > 0 ? `${analysis.overdueDays} 天` : "—",
              color: analysis.overdueDays > 0 ? "var(--status-danger)" : undefined
            }, {
              label: "未收发票",
              val: `${analysis.openInvoiceCount ?? 0} 张`,
              color: undefined
            }, {
              label: "最早逾期",
              val: analysis.earliestOverdueDate ? String(analysis.earliestOverdueDate).slice(0, 10) : "—",
              color: analysis.earliestOverdueDate ? "var(--status-warning)" : undefined
            }].map(({
              label,
              val,
              color
            }) => <div key={label} style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--bg-muted)",
              border: "1px solid var(--border)"
            }}>
                      <div style={{
                fontSize: 10,
                color: "var(--text-secondary)",
                marginBottom: 3
              }}>{label}</div>
                      <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: color ?? "var(--text-primary)",
                fontFamily: "monospace"
              }}>{val}</div>
                    </div>)}
                </div>

                {/* 最近收款日期 */}
                {analysis.lastReceiptDate && <div style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            borderTop: "1px solid var(--border)",
            paddingTop: 8
          }}>
                    最近收款：{String(analysis.lastReceiptDate).slice(0, 10)}
                  </div>}

                {/* 快照时间 */}
                <div style={{
            fontSize: 10,
            color: "var(--text-secondary)"
          }}>
                  快照时间：{new Date(analysis.snapshotAt).toLocaleString("zh-CN")}
                </div>
              </>;
      })()}

          {!anaLoading && !analysis && <div style={{
        textAlign: "center",
        padding: 24,
        color: "var(--text-secondary)",
        fontSize: 12
      }}>暂无信用数据（客户可能无应收记录）</div>}
        </div>}
    </div>;
}