"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { EntityWorkspace, SelectField } from "@/components/design-system";
import { inlineBadge } from "@/components/design-system/cockpit-styles";
import { Panel } from "@/components/design-system";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import { Users, Shield, Key, Lock, Unlock, Building2, Eye } from "lucide-react";
import { enterImpersonation } from "@/lib/impersonate";
import s from "@/components/ui/admin-ui.module.css";
import UserOrgBindingPanel from "@/components/settings/UserOrgBindingPanel";
import { RolePicker, levelColor, type UserRole, type RoleOption } from "@/components/settings/RolePicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConfirmDialogV2 } from "@/components/design-system/dialogs/ConfirmDialogV2";

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });
const API = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch("/api/users" + path, { ...opts, headers: { ...hdr(), ...(opts.headers as any || {}) } });
  return r.json();
};

interface UserRecord {
  id: number;
  username: string;
  real_name_zh: string;
  role?: string;
  role_name_zh?: string;
  store_code?: string;
  status: string;
  user_type?: string;
  roles_detail?: UserRole[];
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { canCreate, canEdit } = usePermission("MENU_SETTINGS_USER");

  const userId = Number(params?.id);

  const [user, setUser] = useState<UserRecord | null>(null);
  const [allRoles, setAllRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; nextStatus?: string }>({ open: false });
  const [sodConflicts, setSodConflicts] = useState<Array<{menu_a: string; menu_b: string; reason_zh: string; severity: string}>>([]);
  const [showSodConfirm, setShowSodConfirm] = useState(false);
  const [showImpersonateConfirm, setShowImpersonateConfirm] = useState(false);

  // 基本信息表单
  const [form, setForm] = useState({
    username: "", real_name_zh: "", store_code: "", newPassword: "", user_type: "REAL",
  });
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [storeOpts, setStoreOpts] = useState<{ value: string; label: string }[]>([]);

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const uRes = await fetch("/api/users", { headers: hdr() }).then(r => r.json());
      const list: UserRecord[] = uRes.data || [];
      setAllRoles(uRes.roles || []);
      const u = list.find(x => Number(x.id) === userId) || null;
      setUser(u);
      if (u) {
        setForm({
          username: u.username,
          real_name_zh: u.real_name_zh || "",
          store_code: u.store_code || "",
          newPassword: "",
          user_type: u.user_type || "REAL",
        });
        setSelectedRoles(u.roles_detail || []);
      }
      // 门店代码下拉：以组织架构 STORE 节点为准
      try {
        const sRes = await fetch("/api/organizations/by-type?type=STORE", { headers: hdr() }).then(r => r.json());
        const sList: any[] = Array.isArray(sRes) ? sRes : (sRes.data || sRes.items || []);
        setStoreOpts(sList
          .filter((o: any) => (o.status ?? "ACTIVE") === "ACTIVE")
          .map((o: any) => ({
            value: o.orgCode ?? o.org_code,
            label: `${o.orgName ?? o.org_name}（${o.orgCode ?? o.org_code}）`,
          })));
      } catch { /* 门店列表失败不阻塞 */ }
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 实际保存逻辑（SoD 检查通过后调用）────────────────────────────────────────
  const doSave = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // 更新基本信息
      const res = await API(`/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ real_name_zh: form.real_name_zh, store_code: form.store_code }),
      });
      if (res.code !== 200) { toast.error(res.msg || t("ui.操作失败", "操作失败")); return; }

      // 更新角色列表（多角色）
      if (selectedRoles.length > 0) {
        const rolesRes = await API(`/${user.id}/roles`, {
          method: "PUT",
          body: JSON.stringify({ roles: selectedRoles.map(r => ({ role_code: r.role_code, is_primary: r.is_primary })) }),
        });
        if (rolesRes.code !== 200) toast.error(rolesRes.msg || t("ui.角色更新失败", "角色更新失败"));
      } else {
        // 清除所有角色（传空数组）
        await API(`/${user.id}/roles`, { method: "PUT", body: JSON.stringify({ roles: [] }) });
      }

      // 同步角色显示开关（is_visible，纯前台显示控制，不影响权限）
      if (selectedRoles.length > 0) {
        const visItems = selectedRoles.map(r => ({
          role_code: r.role_code,
          is_visible: r.is_visible !== false,
        }));
        await API(`/${user.id}/role-visibility`, {
          method: "PUT",
          body: JSON.stringify({ items: visItems }),
        }).catch(() => { /* 显示开关失败不影响主流程 */ });
      }

      // 可选：重置密码
      if (form.newPassword && form.newPassword.length >= 8) {
        const pw = await API(`/${user.id}/password`, { method: "PUT", body: JSON.stringify({ password: form.newPassword }) });
        if (pw.code !== 200) toast.error(pw.msg || t("ui.密码重置失败", "密码重置失败"));
      }

      toast.success(t("ui.修改成功", "修改成功"));
      await loadData();
    } finally { setSubmitting(false); }
  };

  // ── 保存基本信息 + 角色（与列表页抽屉一致的端点）────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    if (!canEdit) { toast.error(t("ui.无编辑权限", "无编辑权限")); return; }
    if (user.username === "admin") { toast.error(t("ui.系统特权总控帐号已锁定拒绝面板编辑", "系统特权总控帐号已锁定，拒绝面板编辑")); return; }
    if (!form.real_name_zh) { toast.error(t("ui.姓名为必填项", "姓名为必填项")); return; }

    // G119 SoD 授权前拦截：多角色组合若触发岗位分离红线则 BLOCK 阻止 / WARN 二次确认
    if (selectedRoles.length > 0) {
      try {
        const sod = await fetch("/api/permissions/check-role-combo", {
          method: "POST", headers: hdr(),
          body: JSON.stringify({ role_codes: selectedRoles.map(r => r.role_code) }),
        }).then(r => r.json());
        const conflicts: Array<{ menu_a: string; menu_b: string; reason_zh: string; severity: string }> = sod?.data?.conflicts || [];
        const blocks = conflicts.filter(c => c.severity === "BLOCK");
        if (blocks.length > 0) {
          toast.error(t("ui.角色组合触发BLOCK岗位分离冲突", "角色组合触发 BLOCK 级岗位分离冲突，无法保存：") + blocks.map(c => `${c.menu_a}↔${c.menu_b}`).join("、"));
          return;
        }
        if (conflicts.length > 0) {
          setSodConflicts(conflicts);
          setShowSodConfirm(true);
          return;
        }
      } catch { /* SoD 校验异常不阻断主流程 */ }
    }

    await doSave();
  };

  // ── 影子登录 ────────────────────────────────────────────────────────────────────
  const doImpersonate = async () => {
    if (!user) return;
    setShowImpersonateConfirm(false);
    try { await enterImpersonation(user.username); }
    catch (e: any) { toast.error(t("ui.影子登录失败", "影子登录失败") + ": " + (e.message || String(e))); }
  };

  // ── 冻结 / 解冻 ──────────────────────────────────────────────────────────────
  const doToggleStatus = async () => {
    if (!user) return;
    const nextStatus = confirm.nextStatus;
    setConfirm({ open: false });
    const res = await API(`/${user.id}/status`, { method: "PUT", body: JSON.stringify({ status: nextStatus }) });
    if (res.code === 200) {
      toast.success(nextStatus === "FROZEN" ? t("ui.已冻结", "已冻结") : t("ui.已解冻", "已解冻"));
      await loadData();
    } else toast.error(res.msg);
  };

  const handleToggle = () => {
    if (!user) return;
    if (user.username === "admin") { toast.error(t("ui.管理员账号不可操作", "管理员账号不可操作")); return; }
    const nextStatus = user.status === "ACTIVE" ? "FROZEN" : "ACTIVE";
    setConfirm({ open: true, nextStatus });
  };

  // ── Loading / not found ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className={s.card}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 14 }}>
              <div className={s.shimmer} style={{ width: 140, height: 14, borderRadius: 4 }}/>
              <div className={s.shimmer} style={{ width: 200, height: 14, borderRadius: 4 }}/>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className={s.card}>
          <div className={s.emptyState}>
            <Users size={40}/>
            <div className={s.emptyStateText}>{t("ui.未找到该用户", "未找到该用户")}</div>
            <button type="button" onClick={() => router.push("/settings/users")} className={s.btnSecondary} style={{ marginTop: 12 }}>
              {t("common.back", "返回")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user.username === "admin";
  const primaryRole = (user.roles_detail || []).find(r => r.is_primary)
    ?? [...(user.roles_detail || [])].sort((a, b) => b.approval_level - a.approval_level)[0];
  const editable = canEdit && !isAdmin;

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const basicTab = (
    <Panel title={t("ui.基本信息", "基本信息")} icon={<Users size={14}/>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <div className={s.field}>
          <label className={s.lbl}>{t("ui.登录用户名", "登录用户名")}</label>
          <input disabled value={form.username} className={s.inp}
            style={{ fontFamily: "monospace", opacity: 0.6, cursor: "not-allowed", background: "var(--bg-muted)" }}/>
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t("ui.姓名", "姓名")} <span style={{ color: "var(--status-danger)" }}>*</span></label>
          <input value={form.real_name_zh} onChange={e => f("real_name_zh", e.target.value)} disabled={!editable}
            placeholder="如 张三" className={s.inp} style={{ opacity: editable ? 1 : 0.6 }}/>
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t("ui.账号类型", "账号类型")}</label>
          <input disabled value={form.user_type === "TEST" ? "🧪 " + t("ui.测试账号", "测试账号") : "✅ " + t("ui.正式员工", "正式员工")}
            className={s.inp} style={{ opacity: 0.6, cursor: "not-allowed", background: "var(--bg-muted)" }}/>
        </div>

        {/* 重置密码 */}
        <div className={s.formSection} style={{ color: form.newPassword ? "var(--status-warning)" : "var(--text-secondary)" }}>
          <Key size={12}/>{t("ui.重置密码可选", "重置密码（可选）")}
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t("ui.新密码留空则不修改", "新密码（留空则不修改）")}</label>
          <input type="password" value={form.newPassword} onChange={e => f("newPassword", e.target.value)} disabled={!editable}
            placeholder={t("ui.至少8位留空保持原密码", "至少 8 位；留空保持原密码")} className={s.inp}
            style={{ opacity: editable ? 1 : 0.6 }}/>
          <div style={{ fontSize: 11, marginTop: 5,
            color: form.newPassword && form.newPassword.length < 8 ? "var(--status-warning)" : form.newPassword ? "var(--status-success)" : "var(--text-secondary)" }}>
            {form.newPassword && form.newPassword.length < 8
              ? `⚠️ ${t("ui.密码长度不足8位", "密码长度不足 8 位")}`
              : form.newPassword
                ? `✓ ${t("ui.保存后将更新登录密码", "保存后将更新登录密码")}`
                : t("ui.留空则保持原密码不变", "留空则保持原密码不变")}
          </div>
        </div>
      </div>
    </Panel>
  );

  const rolesTab = (
    <Panel title={t("ui.角色权限分配", "角色权限分配")} icon={<Shield size={14}/>}
      extra={selectedRoles.length > 0 ? (
        <span style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 700 }}>
          {selectedRoles.length} {t("ui.个", "个")}
        </span>
      ) : undefined}>
      <RolePicker
        allRoles={allRoles}
        selected={selectedRoles}
        onChange={editable ? setSelectedRoles : () => { /* 只读 */ }}
        maxHeight={560}
      />
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>
        {t("ui.可为用户分配多个角色权限取各角色并集主角色用于显示", "可为用户分配多个角色，权限取各角色并集。主角色（★）用于显示")}
      </div>
    </Panel>
  );

  const orgTab = (
    <Panel title={t("ui.组织与数据范围", "组织与数据范围（决定可见数据范围）")} icon={<Building2 size={14}/>}>
      <UserOrgBindingPanel
        userId={user.id}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canEdit}
      />
    </Panel>
  );

  const storeTab = (
    <Panel title={t("ui.门店代码POS", "门店代码（POS 门店专用·可选）")} icon={<Building2 size={14}/>}>
      <div className={s.field}>
        <label className={s.lbl}>{t("ui.门店代码POS", "门店代码（POS 门店专用·可选）")}</label>
        <SelectField
          value={form.store_code || ""}
          onChange={v => f("store_code", v)}
          options={[{ value: "ALL", label: "全部门店（ALL）" }, ...storeOpts]}
          allowEmpty
          emptyLabel="非门店用户（留空）"
          disabled={!editable}
        />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
          ⚠️ 门店代码仅用于 POS 门店行级隔离，<b>不再决定公司数据范围</b>（范围看「组织与数据范围」页）。门店来自组织架构 STORE 类型组织。
        </div>
      </div>
    </Panel>
  );

  const statusBadge = (
    <span style={inlineBadge(user.status === "ACTIVE" ? "success" : "danger")}>
      {user.status === "ACTIVE" ? t("status.normal", "在职") : t("ui.已冻结", "冻结")}
    </span>
  );

  const actions = (
    <>
      {editable && (
        <button type="button" onClick={handleSave} disabled={submitting} className={s.btnPrimaryGrad}>
          {submitting ? t("ui.处理中", "处理中...") : t("common.save", "保存")}
        </button>
      )}
      {!isAdmin && user.status === "ACTIVE" && (
        <button type="button" className={s.btnSm} title={t("ui.以该用户身份查看真实界面影子模式", "以该用户身份查看真实界面（影子模式，仅测试/排障）")}
          onClick={() => setShowImpersonateConfirm(true)}>
          <Eye size={12}/>{t("ui.以其身份查看", "以其身份查看")}
        </button>
      )}
      {!isAdmin && (
        <button type="button" onClick={handleToggle}
          className={`${s.btnSm} ${user.status === "ACTIVE" ? s.btnDanger : s.btnSecondary}`}>
          {user.status === "ACTIVE"
            ? <><Lock size={12}/>{t("ui.冻结", "冻结")}</>
            : <><Unlock size={12}/>{t("ui.解冻", "解冻")}</>}
        </button>
      )}
      {isAdmin && (
        <span style={inlineBadge("warning")}>{t("ui.超管保护", "超管保护")}</span>
      )}
    </>
  );

  const subtitleCol = primaryRole ? levelColor(primaryRole.approval_level) : undefined;

  return (
    <div className="animate-fade-in">
      <EntityWorkspace
        title={user.real_name_zh || user.username}
        subtitle={primaryRole ? (
          <span style={{ color: subtitleCol, fontWeight: 600 }}>{primaryRole.role_name_zh}</span>
        ) : t("ui.未分配角色", "未分配角色")}
        status={statusBadge}
        onBack={() => router.push("/settings/users")}
        actions={actions}
        tabs={[
          { key: "basic", label: t("ui.基本信息", "基本信息"), content: basicTab },
          { key: "roles", label: t("ui.角色权限", "角色权限"), content: rolesTab },
          { key: "org", label: t("ui.组织与数据范围", "组织与数据范围"), content: orgTab },
          { key: "store", label: t("ui.POS门店", "POS门店"), content: storeTab },
        ]}
      />

      <ConfirmDialog
        open={confirm.open}
        title={confirm.nextStatus === "FROZEN" ? t("ui.冻结用户", "冻结用户") : t("ui.解冻用户", "解冻用户")}
        message={`${t("common.confirm", "确认")}${confirm.nextStatus === "FROZEN" ? t("ui.冻结", "冻结") : t("ui.解冻", "解冻")}${t("ui.用户", "用户")} ${user.real_name_zh}？`}
        confirmLabel={confirm.nextStatus === "FROZEN" ? t("ui.确认冻结", "确认冻结") : t("ui.确认解冻", "确认解冻")}
        danger={confirm.nextStatus === "FROZEN"}
        onConfirm={doToggleStatus}
        onCancel={() => setConfirm({ open: false })}
      />

      <ConfirmDialogV2
        open={showSodConfirm}
        title="岗位分离风险"
        message={<>该用户的角色组合存在岗位分离风险（WARN）：{sodConflicts.map((c, i) => <div key={i}>· {c.reason_zh}</div>)}<br/>仍要保存吗？</>}
        confirmLabel="仍要保存"
        onConfirm={() => { setShowSodConfirm(false); doSave(); }}
        onCancel={() => setShowSodConfirm(false)}
      />

      <ConfirmDialogV2
        open={showImpersonateConfirm}
        title="影子登录"
        message={`确认以「${user?.real_name_zh || user?.username}」身份查看？将切换到影子模式，可随时退出。`}
        confirmLabel="确认切换"
        onConfirm={doImpersonate}
        onCancel={() => setShowImpersonateConfirm(false)}
      />
    </div>
  );
}
