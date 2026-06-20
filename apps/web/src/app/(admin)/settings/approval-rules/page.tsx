"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Shield, CheckCircle, XCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { ConfirmDialogV2 } from "@/components/design-system";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";

// ── Auth helper ───────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface RuleStep {
  id?: string;
  stepNo: number;
  approverType: string;
  approverRole: string;
  approverUserId?: string;
  orgScope: string;
  requiredApprovalCount: number;
  allowAdminOverride: boolean;
  // Phase G: SLA 配置
  slaHours: number;
  reminderIntervalHours: number;
  maxReminders: number;
  escalationEnabled: boolean;
  escalationAfterHours: number | null;
  escalationRole: string;
}
interface ApprovalRule {
  id: string;
  ruleCode: string;
  moduleCode: string;
  bizType: string;
  orgType: string | null;
  companyCode: string | null;
  projectCode: string | null;
  currencyCode: string | null;
  minAmount: number;
  maxAmount: number | null;
  approvalMode: string;
  priority: number;
  enabled: boolean;
  remark: string | null;
  createdAt: string;
  steps: RuleStep[];
}

// ── 常量 ─────────────────────────────────────────────────────────────────────
const BIZ_TYPE_OPTIONS = [{
  value: "PR",
  label: "采购申请"
}, {
  value: "PO",
  label: "采购订单"
}, {
  value: "PAYMENT",
  label: "付款申请"
}, {
  value: "FUND",
  label: "股东资金"
}, {
  value: "EXPENSE_REQUEST",
  label: "费用申请"
}, {
  value: "REIMBURSEMENT",
  label: "报销付款"
}, {
  value: "SALES_ORDER",
  label: "销售订单"
}, {
  value: "SALES_RETURN",
  label: "销售退货"
}, {
  value: "STORE_POS_VOID",
  label: "门店作废"
}, {
  value: "CUSTOMER_CREDIT_UNFREEZE",
  label: "客户信用解冻"
}];
const APPROVAL_MODE_OPTIONS = [{
  value: "SEQUENTIAL",
  label: "顺序审批"
}, {
  value: "PARALLEL",
  label: "并行审批"
}, {
  value: "ANY_ONE",
  label: "任一通过"
}];
const ROLE_OPTIONS = ["ROLE_ADMIN", "ROLE_CEO", "ROLE_FIN_CFO", "ROLE_FIN_ACCT", "ROLE_PRC_BUYER", "ROLE_REGION_MGR", "ROLE_FARM_MGR", "ROLE_PROJECT_MGR", "ROLE_FACTORY_ACCT", "ROLE_FACTORY_ACCOUNTANT", "ROLE_GROUP_FINANCE"];
const APPROVER_TYPE_OPTIONS = [{
  value: "ROLE",
  label: "角色（全局）",
  hint: "所有拥有该角色的用户均可审批"
}, {
  value: "COMPANY_ROLE",
  label: "角色（本公司）",
  hint: "限定公司范围内的角色用户"
}, {
  value: "PROJECT_ROLE",
  label: "角色（本项目）",
  hint: "限定项目范围内的角色用户"
}, {
  value: "USER",
  label: "指定用户",
  hint: "按 userId 指定具体审批人"
}, {
  value: "ORG_MANAGER",
  label: "组织负责人",
  hint: "自动查找公司/项目的负责人"
}, {
  value: "PROJECT_MANAGER",
  label: "项目负责人",
  hint: "自动查找项目的 project_manager"
}, {
  value: "COMPANY_FINANCE",
  label: "公司财务负责人",
  hint: "优先级：厂级会计→集团财务→财务总监"
}, {
  value: "DIRECT_MANAGER",
  label: "直属上级",
  hint: "读取申请人的 manager_user_id"
}];
const BIZ_TYPE_LABEL: Record<string, string> = {
  PR: "采购申请",
  PO: "采购订单",
  PAYMENT: "付款申请",
  FUND: "股东资金",
  EXPENSE_REQUEST: "费用申请",
  REIMBURSEMENT: "报销付款",
  SALES_ORDER: "销售订单",
  SALES_RETURN: "销售退货",
  STORE_POS_VOID: "门店作废",
  CUSTOMER_CREDIT_UNFREEZE: "客户信用解冻"
};
const MODE_LABEL: Record<string, string> = {
  SEQUENTIAL: "顺序",
  PARALLEL: "并行",
  ANY_ONE: "任一"
};
function fmtAmount(n: number | null) {
  if (n == null) return "无上限";
  return Number(n).toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  });
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchRules(bizType?: string, enabled?: string) {
  const p = new URLSearchParams({
    page: "1",
    pageSize: "100"
  });
  if (bizType) p.set("bizType", bizType);
  if (enabled !== "") p.set("enabled", enabled ?? "");
  const res = await fetch(`/api/approval/rules?${p}`, {
    headers: authHdr()
  });
  if (!res.ok) return {
    items: [],
    total: 0
  };
  return res.json();
}
async function createRule(body: Record<string, any>) {
  const res = await fetch("/api/approval/rules", {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify(body)
  });
  return res.json();
}
async function updateRule(id: string, body: Record<string, any>) {
  const res = await fetch(`/api/approval/rules/${id}`, {
    method: "PUT",
    headers: authHdr(),
    body: JSON.stringify(body)
  });
  return res.json();
}
async function toggleStatus(id: string, enabled: boolean) {
  const res = await fetch(`/api/approval/rules/${id}/status`, {
    method: "PATCH",
    headers: authHdr(),
    body: JSON.stringify({
      enabled
    })
  });
  return res.json();
}
async function deleteRule(id: string) {
  const res = await fetch(`/api/approval/rules/${id}`, {
    method: "DELETE",
    headers: authHdr()
  });
  return res.ok;
}

// 是否需要展示「角色」字段
function needsRoleField(t: string) {
  return t === "ROLE" || t === "COMPANY_ROLE" || t === "PROJECT_ROLE";
}
// 是否需要展示「指定用户ID」字段
function needsUserField(t: string) {
  return t === "USER";
}

// ── 空步骤工厂 ────────────────────────────────────────────────────────────────
function emptyStep(no: number): RuleStep {
  return {
    stepNo: no,
    approverType: "ROLE",
    approverRole: "ROLE_FIN_CFO",
    approverUserId: "",
    orgScope: "",
    requiredApprovalCount: 1,
    allowAdminOverride: false,
    slaHours: 48,
    reminderIntervalHours: 12,
    maxReminders: 3,
    escalationEnabled: false,
    escalationAfterHours: null,
    escalationRole: ""
  };
}

/** SLA 摘要文字，显示在步骤卡片中 */
function slaSummary(st: RuleStep): string {
  const parts: string[] = [`${st.slaHours ?? 48}h SLA`];
  if ((st.maxReminders ?? 3) > 0) parts.push(`每${st.reminderIntervalHours ?? 12}h催办`);
  if (st.escalationEnabled && st.escalationAfterHours) parts.push(`超${st.escalationAfterHours}h升级${st.escalationRole ? ` → ${st.escalationRole}` : ''}`);
  return parts.join(' / ');
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function ApprovalRulesPage() {
  const toast = useToast();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [delRule, setDelRule] = useState<ApprovalRule | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterBizType, setBizType] = useState("");
  const [filterEnabled, setEnabled] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalRule | null>(null);

  // Form state
  const [form, setForm] = useState<{
    ruleCode: string;
    moduleCode: string;
    bizType: string;
    orgType: string;
    companyCode: string;
    projectCode: string;
    currencyCode: string;
    minAmount: string;
    maxAmount: string;
    approvalMode: string;
    priority: string;
    remark: string;
    steps: RuleStep[];
  }>({
    ruleCode: "",
    moduleCode: "MENU_WORKFLOW",
    bizType: "PO",
    orgType: "",
    companyCode: "",
    projectCode: "",
    currencyCode: "",
    minAmount: "0",
    maxAmount: "",
    approvalMode: "SEQUENTIAL",
    priority: "100",
    remark: "",
    steps: [emptyStep(1)]
  });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRules(filterBizType || undefined, filterEnabled !== "" ? filterEnabled : undefined);
      setRules(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filterBizType, filterEnabled]);
  useEffect(() => {
    load();
  }, [load]);
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const openCreate = () => {
    setEditing(null);
    setForm({
      ruleCode: "",
      moduleCode: "MENU_WORKFLOW",
      bizType: "PO",
      orgType: "",
      companyCode: "",
      projectCode: "",
      currencyCode: "",
      minAmount: "0",
      maxAmount: "",
      approvalMode: "SEQUENTIAL",
      priority: "100",
      remark: "",
      steps: [emptyStep(1)]
    });
    setDrawerOpen(true);
  };
  const openEdit = (rule: ApprovalRule) => {
    setEditing(rule);
    setForm({
      ruleCode: rule.ruleCode,
      moduleCode: rule.moduleCode,
      bizType: rule.bizType,
      orgType: rule.orgType ?? "",
      companyCode: rule.companyCode ?? "",
      projectCode: rule.projectCode ?? "",
      currencyCode: rule.currencyCode ?? "",
      minAmount: String(rule.minAmount ?? 0),
      maxAmount: rule.maxAmount != null ? String(rule.maxAmount) : "",
      approvalMode: rule.approvalMode,
      priority: String(rule.priority),
      remark: rule.remark ?? "",
      steps: rule.steps.length ? rule.steps.map(st => ({
        ...st,
        // SLA 字段兼容旧规则（后端默认值）
        slaHours: (st as any).slaHours ?? 48,
        reminderIntervalHours: (st as any).reminderIntervalHours ?? 12,
        maxReminders: (st as any).maxReminders ?? 3,
        escalationEnabled: (st as any).escalationEnabled ?? false,
        escalationAfterHours: (st as any).escalationAfterHours ?? null,
        escalationRole: (st as any).escalationRole ?? ''
      })) : [emptyStep(1)]
    });
    setDrawerOpen(true);
  };
  const handleSave = async () => {
    if (!form.ruleCode.trim()) {
      toast.warning("规则代码不能为空");
      return;
    }
    if (form.steps.length === 0) {
      toast.warning("至少需要一个审批步骤");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ruleCode: form.ruleCode,
        moduleCode: form.moduleCode,
        bizType: form.bizType,
        orgType: form.orgType || undefined,
        companyCode: form.companyCode || undefined,
        projectCode: form.projectCode || undefined,
        currencyCode: form.currencyCode || undefined,
        minAmount: Number(form.minAmount) || 0,
        maxAmount: form.maxAmount !== "" ? Number(form.maxAmount) : undefined,
        approvalMode: form.approvalMode,
        priority: Number(form.priority) || 100,
        remark: form.remark || undefined,
        steps: form.steps.map(st => ({
          stepNo: st.stepNo,
          approverType: st.approverType,
          approverRole: needsRoleField(st.approverType) ? st.approverRole || undefined : undefined,
          approverUserId: needsUserField(st.approverType) ? st.approverUserId || undefined : undefined,
          orgScope: st.orgScope || undefined,
          requiredApprovalCount: st.requiredApprovalCount,
          allowAdminOverride: st.allowAdminOverride,
          // SLA 字段
          slaHours: st.slaHours,
          reminderIntervalHours: st.reminderIntervalHours,
          maxReminders: st.maxReminders,
          escalationEnabled: st.escalationEnabled,
          escalationAfterHours: st.escalationEnabled ? st.escalationAfterHours ?? undefined : undefined,
          escalationRole: st.escalationEnabled ? st.escalationRole || undefined : undefined
        }))
      };
      const r = editing ? await updateRule(editing.id, body) : await createRule(body);
      if (r?.statusCode >= 400 || r?.code >= 400) {
        toast.error(r.message || r.msg || "操作失败");
      } else {
        toast.success(editing ? "规则已更新" : "规则已创建");
        setDrawerOpen(false);
        load();
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };
  const handleToggle = async (rule: ApprovalRule) => {
    const r = await toggleStatus(rule.id, !rule.enabled);
    if (r?.statusCode >= 400 || r?.code >= 400) {
      toast.error(r.message || r.msg || "操作失败");
    } else {
      toast.success(rule.enabled ? "已禁用" : "已启用");
      load();
    }
  };
  const handleDelete = (rule: ApprovalRule) => setDelRule(rule);
  const doDelete = async () => {
    const rule = delRule;
    setDelRule(null);
    if (!rule) return;
    const ok = await deleteRule(rule.id);
    if (ok) {
      toast.success("已删除");
      load();
    } else toast.error("删除失败（可能存在进行中的审批实例）");
  };

  // Step editing helpers
  const addStep = () => {
    setForm(f => ({
      ...f,
      steps: [...f.steps, emptyStep(f.steps.length + 1)]
    }));
  };
  const removeStep = (idx: number) => {
    setForm(f => {
      const steps = f.steps.filter((_, i) => i !== idx).map((st, i) => ({
        ...st,
        stepNo: i + 1
      }));
      return {
        ...f,
        steps
      };
    });
  };
  const updateStep = (idx: number, patch: Partial<RuleStep>) => {
    setForm(f => {
      const steps = f.steps.map((st, i) => i === idx ? {
        ...st,
        ...patch
      } : st);
      return {
        ...f,
        steps
      };
    });
  };
  return <div>
      <PageHeader title="审批规则管理" subtitle={`共 ${total} 条规则 — 配置各业务模块的审批步骤和条件`} breadcrumb={["系统设置", "审批规则"]} />

      {/* 工具栏 */}
      <section className={s.card}>
        <div className={s.cardBody} style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }}>
          <div style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap"
        }}>
            <select className={`${s.select} ${u.fs13}`} value={filterBizType} onChange={e => {
            setBizType(e.target.value);
          }}>
              <option value="">全部类型</option>
              {BIZ_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={`${s.select} ${u.fs13}`} value={filterEnabled} onChange={e => {
            setEnabled(e.target.value);
          }}>
              <option value="">全部状态</option>
              <option value="true">已启用</option>
              <option value="false">已禁用</option>
            </select>
            <button style={secondaryActionButton} onClick={load} disabled={loading}>
              <RefreshCw size={14} style={{
              marginRight: 6
            }} />刷新
            </button>
          </div>
          <button style={primaryActionButton} onClick={openCreate}>
            <Plus size={14} style={{
            marginRight: 6
          }} />新建规则
          </button>
        </div>
      </section>

      {/* 规则列表 */}
      {loading ? <section className={s.card}>
          <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>加载中…</div>
        </section> : rules.length === 0 ? <section className={s.card}>
          <div className={s.cardBody} style={{
        textAlign: "center",
        color: "var(--text-disabled)",
        padding: 48
      }}>
            <Shield size={36} style={{
          margin: "0 auto 12px",
          opacity: 0.4
        }} />
            <p>暂无审批规则</p>
          </div>
        </section> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 8
    }}>
          {rules.map(rule => {
        const isExp = expanded.has(rule.id);
        return <section key={rule.id} className={s.card}>
                {/* 规则头部 */}
                <div className={s.cardBody} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            cursor: "pointer"
          }} onClick={() => toggleExpand(rule.id)}>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flex: 1,
              minWidth: 0
            }}>
                    <span style={{
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                background: rule.enabled ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "var(--bg-muted)",
                color: rule.enabled ? "var(--color-accent)" : "var(--text-secondary)"
              }}>
                      {BIZ_TYPE_LABEL[rule.bizType] ?? rule.bizType}
                    </span>
                    <span style={{
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: 14
              }}>{rule.ruleCode}</span>
                    <span className={u.muted12}>
                      {fmtAmount(rule.minAmount)} ~ {fmtAmount(rule.maxAmount)}
                    </span>
                    <span style={{
                fontSize: 12,
                color: "var(--text-disabled)"
              }}>
                      优先级 {rule.priority} · {MODE_LABEL[rule.approvalMode]} · {rule.steps.length} 步
                    </span>
                  </div>
                  <div className={u.flexRow8}>
                    {rule.enabled ? <CheckCircle size={16} style={{
                color: "var(--status-success)"
              }} /> : <XCircle size={16} style={{
                color: "var(--text-disabled)"
              }} />}
                    {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* 展开：步骤 + 操作 */}
                {isExp && <div className={s.cardBody} style={{
            borderTop: "1px solid var(--bg-muted)",
            paddingTop: 12
          }}>
                    {/* 步骤列表 */}
                    {rule.steps.length > 0 && <div className={u.mb12}>
                        <p style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 8
              }}>审批步骤</p>
                        <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 6
              }}>
                          {rule.steps.map(st => <div key={st.id ?? st.stepNo} style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 10px",
                  background: "var(--bg-muted)",
                  borderRadius: 6,
                  fontSize: 13,
                  flexWrap: "wrap"
                }}>
                              <span style={{
                    fontWeight: 700,
                    color: "var(--color-accent)",
                    minWidth: 20
                  }}>
                                {st.stepNo}
                              </span>
                              <span style={{
                    fontSize: 11,
                    background: "var(--border)",
                    color: "var(--text-primary)",
                    padding: "1px 6px",
                    borderRadius: 4
                  }}>
                                {APPROVER_TYPE_OPTIONS.find(o => o.value === st.approverType)?.label ?? st.approverType}
                              </span>
                              {st.approverRole && <code style={{
                    background: "color-mix(in srgb, var(--status-special) 12%, transparent)",
                    color: "var(--status-special)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontSize: 12
                  }}>
                                  {st.approverRole}
                                </code>}
                              {st.allowAdminOverride && <span style={{
                    fontSize: 11,
                    color: "var(--status-warning)",
                    background: "color-mix(in srgb, var(--status-warning) 16%, transparent)",
                    padding: "1px 5px",
                    borderRadius: 3
                  }}>
                                  ADMIN可代理
                                </span>}
                              {/* SLA 摘要 */}
                              <span style={{
                    fontSize: 10,
                    color: "var(--color-accent)",
                    background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    fontFamily: "monospace"
                  }}>
                                ⏱ {slaSummary(st as RuleStep)}
                              </span>
                            </div>)}
                        </div>
                      </div>}

                    {rule.remark && <p style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 12
            }}>备注：{rule.remark}</p>}

                    {/* 操作按钮 */}
                    <div style={{
              display: "flex",
              gap: 8
            }}>
                      <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => openEdit(rule)}>
                        <Pencil size={12} style={{
                  marginRight: 4
                }} />编辑
                      </button>
                      <button className={`${s.btnSecondary} ${u.fs12}`} onClick={() => handleToggle(rule)}>
                        {rule.enabled ? <><ToggleRight size={12} style={{
                    marginRight: 4
                  }} />禁用</> : <><ToggleLeft size={12} style={{
                    marginRight: 4
                  }} />启用</>}
                      </button>
                      <button className={`${s.btnDanger} ${u.fs12}`} onClick={() => handleDelete(rule)}>
                        <Trash2 size={12} style={{
                  marginRight: 4
                }} />删除
                      </button>
                    </div>
                  </div>}
              </section>;
      })}
        </div>}

      {/* ── 创建/编辑侧栏 ── */}
      <RightDrawer open={drawerOpen} title={editing ? `编辑规则 — ${editing.ruleCode}` : "新建审批规则"} onClose={() => setDrawerOpen(false)} width={520}>
        <div style={{
        padding: "0 20px 20px"
      }}>
          {/* 基本信息 */}
          <h4 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "12px 0 8px",
          color: "var(--text-primary)"
        }}>基本信息</h4>
          <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 10
        }}>
            <div>
              <label className={s.label}>规则代码 *</label>
              <input className={s.input} value={form.ruleCode} disabled={!!editing} onChange={e => setForm(f => ({
              ...f,
              ruleCode: e.target.value
            }))} placeholder="如 PO-HIGH-AMOUNT" />
            </div>
            <div>
              <label className={s.label}>业务类型 *</label>
              <select className={s.select} value={form.bizType} onChange={e => setForm(f => ({
              ...f,
              bizType: e.target.value
            }))}>
                {BIZ_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={s.label}>最小金额</label>
              <input className={s.input} type="number" value={form.minAmount} onChange={e => setForm(f => ({
              ...f,
              minAmount: e.target.value
            }))} />
            </div>
            <div>
              <label className={s.label}>最大金额（留空=无上限）</label>
              <input className={s.input} type="number" value={form.maxAmount} onChange={e => setForm(f => ({
              ...f,
              maxAmount: e.target.value
            }))} placeholder="无上限" />
            </div>
            <div>
              <label className={s.label}>审批模式</label>
              <select className={s.select} value={form.approvalMode} onChange={e => setForm(f => ({
              ...f,
              approvalMode: e.target.value
            }))}>
                {APPROVAL_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={s.label}>优先级（数值小先匹配）</label>
              <input className={s.input} type="number" value={form.priority} onChange={e => setForm(f => ({
              ...f,
              priority: e.target.value
            }))} />
            </div>
            <div>
              <label className={s.label}>公司代码（留空=全局）</label>
              <input className={s.input} value={form.companyCode} onChange={e => setForm(f => ({
              ...f,
              companyCode: e.target.value
            }))} placeholder="PHX_AGRI_LA" />
            </div>
            <div>
              <label className={s.label}>项目代码（留空=全局）</label>
              <input className={s.input} value={form.projectCode} onChange={e => setForm(f => ({
              ...f,
              projectCode: e.target.value
            }))} placeholder="PROJ_MENGSAI" />
            </div>
          </div>
          <div className={u.mb12}>
            <label className={s.label}>备注</label>
            <input className={s.input} value={form.remark} onChange={e => setForm(f => ({
            ...f,
            remark: e.target.value
          }))} />
          </div>

          {/* 审批步骤 */}
          <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "16px 0 8px"
        }}>
            <h4 style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)"
          }}>审批步骤</h4>
            <button className={`${s.btnSecondary} ${u.fs12}`} onClick={addStep}>
              <Plus size={12} style={{
              marginRight: 4
            }} />添加步骤
            </button>
          </div>

          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 20
        }}>
            {form.steps.map((st, idx) => <div key={idx} style={{
            padding: "10px 12px",
            background: "var(--bg-muted)",
            borderRadius: 8,
            border: "1px solid var(--border)"
          }}>
                <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8
            }}>
                  <span style={{
                fontWeight: 600,
                fontSize: 13,
                color: "var(--color-accent)"
              }}>步骤 {st.stepNo}</span>
                  {form.steps.length > 1 && <button onClick={() => removeStep(idx)} style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--status-danger)",
                padding: 0
              }}>
                      <Trash2 size={13} />
                    </button>}
                </div>
                <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8
            }}>
                  <div style={{
                gridColumn: "1 / -1"
              }}>
                    <label className={s.label}>审批人类型</label>
                    <select className={s.select} value={st.approverType} onChange={e => updateStep(idx, {
                  approverType: e.target.value,
                  approverUserId: ""
                })}>
                      {APPROVER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
                    </select>
                  </div>
                  {needsRoleField(st.approverType) && <div>
                      <label className={s.label}>审批角色</label>
                      <select className={s.select} value={st.approverRole} onChange={e => updateStep(idx, {
                  approverRole: e.target.value
                })}>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>}
                  {needsUserField(st.approverType) && <div>
                      <label className={s.label}>指定用户 ID</label>
                      <input className={s.input} type="text" value={st.approverUserId ?? ""} onChange={e => updateStep(idx, {
                  approverUserId: e.target.value
                })} placeholder="用户数字ID" />
                    </div>}
                  {!needsRoleField(st.approverType) && !needsUserField(st.approverType) && <div style={{
                gridColumn: "1 / -1"
              }}>
                      <p style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  background: "color-mix(in srgb, var(--status-success) 12%, transparent)",
                  padding: "6px 10px",
                  borderRadius: 6
                }}>
                        系统将在审批启动时自动解析审批人（无需手动指定）
                      </p>
                    </div>}
                  <div>
                    <label className={s.label}>所需人数</label>
                    <input className={s.input} type="number" min={1} value={st.requiredApprovalCount} onChange={e => updateStep(idx, {
                  requiredApprovalCount: Number(e.target.value)
                })} />
                  </div>
                </div>
                <div style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
                  <input type="checkbox" id={`aao-${idx}`} checked={st.allowAdminOverride} onChange={e => updateStep(idx, {
                allowAdminOverride: e.target.checked
              })} />
                  <label htmlFor={`aao-${idx}`} style={{
                fontSize: 12,
                color: "var(--text-primary)",
                cursor: "pointer"
              }}>
                    允许 ADMIN 代理审批（跳过角色校验）
                  </label>
                </div>

                {/* ── Phase G: SLA 配置 ── */}
                <div style={{
              marginTop: 10,
              padding: "10px 12px",
              background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
              borderRadius: 8,
              border: "1px solid var(--color-accent)"
            }}>
                  <p style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-accent)",
                marginBottom: 8
              }}>⏱ SLA 配置</p>
                  <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8
              }}>
                    <div>
                      <label className={s.label}>SLA 时限（小时）</label>
                      <input className={s.input} type="number" min={1} value={st.slaHours} onChange={e => updateStep(idx, {
                    slaHours: Number(e.target.value) || 48
                  })} />
                    </div>
                    <div>
                      <label className={s.label}>催办间隔（小时）</label>
                      <input className={s.input} type="number" min={1} value={st.reminderIntervalHours} onChange={e => updateStep(idx, {
                    reminderIntervalHours: Number(e.target.value) || 12
                  })} />
                    </div>
                    <div>
                      <label className={s.label}>最多催办次数</label>
                      <input className={s.input} type="number" min={0} value={st.maxReminders} onChange={e => updateStep(idx, {
                    maxReminders: Number(e.target.value)
                  })} />
                    </div>
                  </div>
                  <div style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                    <input type="checkbox" id={`esc-${idx}`} checked={st.escalationEnabled} onChange={e => updateStep(idx, {
                  escalationEnabled: e.target.checked
                })} />
                    <label htmlFor={`esc-${idx}`} style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  cursor: "pointer"
                }}>
                      启用自动升级（Escalation）
                    </label>
                  </div>
                  {st.escalationEnabled && <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 8
              }}>
                      <div>
                        <label className={s.label}>超时多久后升级（小时）*</label>
                        <input className={s.input} type="number" min={1} value={st.escalationAfterHours ?? ""} onChange={e => updateStep(idx, {
                    escalationAfterHours: Number(e.target.value) || null
                  })} placeholder="如：72" />
                      </div>
                      <div>
                        <label className={s.label}>升级目标角色 *</label>
                        <select className={s.select} value={st.escalationRole} onChange={e => updateStep(idx, {
                    escalationRole: e.target.value
                  })}>
                          <option value="">-- 选择角色 --</option>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>}
                  <div style={{
                marginTop: 6,
                fontSize: 11,
                color: "var(--color-accent)"
              }}>
                    摘要：{slaSummary(st)}
                  </div>
                </div>
              </div>)}
          </div>

          <div style={{
          display: "flex",
          gap: 10
        }}>
            <button className={`${s.btnSecondary} ${u.flex1}`} onClick={() => setDrawerOpen(false)}>
              取消
            </button>
            <button onClick={handleSave} disabled={saving} style={{ ...primaryActionButton, flex: 2, justifyContent: "center" }}>
              {saving ? "保存中…" : editing ? "保存修改" : "创建规则"}
            </button>
          </div>
        </div>
      </RightDrawer>

      <ConfirmDialogV2 open={delRule != null} title="删除审批规则" danger confirmLabel="确认删除" message={`确认删除规则「${delRule?.ruleCode ?? ''}」？此操作不可撤销。`} onConfirm={doDelete} onCancel={() => setDelRule(null)} />
    </div>;
}