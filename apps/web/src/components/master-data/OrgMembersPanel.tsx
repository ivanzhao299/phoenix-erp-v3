'use client';

/**
 * OrgMembersPanel — 组织成员管理面板（HOME-1 后期补足；ORG-MERGE 抽出）
 *
 * 用途：在 /master-data/organizations 的"成员" Tab 内显示某组织的成员列表，
 * 支持新增/移除/数据范围等级修改。
 *
 * 此组件由 /settings/organizations/page.tsx 的成员管理逻辑抽出，
 * 作为方案 B（settings → redirect → master-data）的 Tab 整合实现。
 *
 * API:
 *   · GET    /api/org/organizations/:orgId/members
 *   · POST   /api/org/user-orgs                 — 新增分配
 *   · PUT    /api/org/user-orgs/:userOrgId      — 改数据范围
 *   · DELETE /api/org/user-orgs/:userOrgId      — 移除成员
 *   · GET    /api/users                         — 全部用户（候选池）
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, X, Trash2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import {
  cockpitCard, cockpitCardHeader, cockpitCardHeaderTitle, cockpitCardHeaderHint,
  primaryActionButton, secondaryActionButton, inputField, inlineBadge, formLabel,
  drawerMask, drawerPanel, drawerHeader, drawerHeaderTitle, drawerCloseButton, drawerFooter,
} from "@/components/design-system/cockpit-styles";

const tok = () => typeof window !== "undefined"
  ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
  : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const SCOPE_LEVELS = [
  { value: "SELF",    label: "个人" },
  { value: "PROJECT", label: "项目" },
  { value: "COMPANY", label: "公司" },
  { value: "REGION",  label: "区域" },
  { value: "GROUP",   label: "集团" },
] as const;

interface OrgMember {
  userOrgId: number; isPrimary: boolean; dataScopeLevel: string;
  id: number; username: string; realNameZh: string;
  role: string; roleNameZh: string; userStatus: string | number;
}
interface AllUser {
  id: number; username: string; realNameZh: string;
  role: string; roleNameZh: string; status: string | number;
}

export function OrgMembersPanel({ orgId, orgName }: { orgId: number | null; orgName?: string }) {
  const toast = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignDrawer, setAssignDrawer] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignScope, setAssignScope] = useState<string>("COMPANY");
  const [assigning, setAssigning] = useState<number | null>(null);

  const loadMembers = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/organizations/${id}/members`, { headers: hdr() });
      const json = await res.json();
      if (json.code === 200) {
        setMembers((json.data ?? []).map((r: Record<string, unknown>) => ({
          userOrgId: (r.user_org_id ?? r.userOrgId) as number,
          isPrimary: !!(r.is_primary ?? r.isPrimary),
          dataScopeLevel: String(r.data_scope_level ?? r.dataScopeLevel ?? "COMPANY"),
          id: r.id as number,
          username: (r.username ?? "") as string,
          realNameZh: (r.real_name_zh ?? r.realNameZh ?? "") as string,
          role: (r.role ?? "") as string,
          roleNameZh: (r.role_name_zh ?? r.roleNameZh ?? "") as string,
          userStatus: (r.user_status ?? r.userStatus ?? "ACTIVE") as string | number,
        })));
      }
    } finally { setLoading(false); }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { headers: hdr() });
      const json = await res.json();
      setAllUsers((Array.isArray(json.data) ? json.data : []).map((u: Record<string, unknown>) => ({
        id: u.id as number,
        username: (u.username ?? "") as string,
        realNameZh: (u.real_name_zh ?? u.real_name ?? "") as string,
        role: (u.role ?? "") as string,
        roleNameZh: (u.role_name_zh ?? "") as string,
        status: (u.status ?? "ACTIVE") as string | number,
      })));
    } catch { /* 静默 */ }
  }, []);

  useEffect(() => {
    if (orgId) loadMembers(orgId);
    else setMembers([]);
  }, [orgId, loadMembers]);

  useEffect(() => { loadAllUsers(); }, [loadAllUsers]);

  const memberIds = useMemo(() => new Set(members.map(m => m.id)), [members]);
  const candidateUsers = useMemo(() =>
    allUsers.filter(u =>
      !memberIds.has(u.id) &&
      (!assignSearch
        || u.username.toLowerCase().includes(assignSearch.toLowerCase())
        || u.realNameZh.includes(assignSearch))
    ).slice(0, 50),
    [allUsers, memberIds, assignSearch]);

  const assignUser = async (userId: number) => {
    if (!orgId) return;
    setAssigning(userId);
    try {
      const res = await fetch("/api/org/user-orgs", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ userId, orgId, dataScopeLevel: assignScope, isPrimary: false }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(`已分配至「${orgName || '当前组织'}」`);
        await loadMembers(orgId);
      } else throw new Error(json.message ?? "分配失败");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally { setAssigning(null); }
  };

  const updateScope = async (m: OrgMember, level: string) => {
    try {
      const res = await fetch(`/api/org/user-orgs/${m.userOrgId}`, {
        method: "PUT", headers: hdr(), body: JSON.stringify({ dataScopeLevel: level }),
      });
      const json = await res.json();
      if (json.code === 200) {
        setMembers(prev => prev.map(p => p.userOrgId === m.userOrgId ? { ...p, dataScopeLevel: level } : p));
      }
    } catch { toast.error("更新失败"); }
  };

  const removeMember = async (m: OrgMember) => {
    setAssigning(m.id);
    try {
      await fetch(`/api/org/user-orgs/${m.userOrgId}`, { method: "DELETE", headers: hdr() });
      toast.success("已移除");
      if (orgId) await loadMembers(orgId);
    } catch { toast.error("操作失败"); }
    finally { setAssigning(null); }
  };

  if (!orgId) {
    return (
      <div style={{ ...cockpitCard, padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
        请先在左侧选择一个组织节点
      </div>
    );
  }

  return (
    <div style={{ ...cockpitCard, display: 'flex', flexDirection: 'column' }}>
      <div style={cockpitCardHeader}>
        <UserPlus size={14} style={{ color: 'var(--color-primary)' }} />
        <span style={cockpitCardHeaderTitle}>组织成员</span>
        <span style={cockpitCardHeaderHint}>{members.length} 人</span>
        <button
          type="button"
          onClick={() => setAssignDrawer(true)}
          style={{ ...primaryActionButton, padding: '6px 14px', fontSize: 12 }}
        >
          <UserPlus size={12} /> 添加成员
        </button>
      </div>

      <div style={{ padding: '4px 12px 12px' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>加载中…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            该组织暂无成员。点击右上"添加成员"分配用户。
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)' }}>
                <th style={thStyle}>成员</th>
                <th style={thStyle}>账号</th>
                <th style={thStyle}>角色</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 140 }}>数据范围</th>
                <th style={{ ...thStyle, textAlign: 'center', width: 80 }}>状态</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.userOrgId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <strong style={{ color: 'var(--text-primary)' }}>{m.realNameZh || m.username}</strong>
                    {m.isPrimary && <span style={{ ...inlineBadge('success'), marginLeft: 6 }}>主部门</span>}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{m.username}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{m.roleNameZh || m.role || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <select
                      value={m.dataScopeLevel}
                      onChange={(e) => updateScope(m, e.target.value)}
                      style={{ ...inputField, fontSize: 12, padding: '4px 8px', width: 120 }}
                    >
                      {SCOPE_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={inlineBadge(String(m.userStatus) === 'ACTIVE' || m.userStatus === 1 ? 'success' : 'default')}>
                      {String(m.userStatus) === 'ACTIVE' || m.userStatus === 1 ? '在职' : '停用'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      onClick={() => removeMember(m)}
                      disabled={assigning === m.id}
                      title="移除"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--status-danger)', padding: 4 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 添加成员抽屉 — 全局 drawer token */}
      {assignDrawer && (
        <div style={drawerMask} onClick={() => setAssignDrawer(false)}>
          <div style={drawerPanel(460)} onClick={(e) => e.stopPropagation()}>
            <div style={drawerHeader}>
              <h2 style={drawerHeaderTitle}>添加成员到「{orgName || '组织'}」</h2>
              <button onClick={() => setAssignDrawer(false)} style={drawerCloseButton}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={formLabel}>数据范围等级</label>
              <select value={assignScope} onChange={(e) => setAssignScope(e.target.value)} style={inputField}>
                {SCOPE_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="搜索用户名 / 真实姓名…"
                style={{ ...inputField, paddingLeft: 32 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {candidateUsers.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  暂无候选用户
                </div>
              ) : candidateUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => assignUser(u.id)}
                  disabled={assigning === u.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                  }}>{(u.realNameZh || u.username).slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{u.realNameZh || u.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.username} · {u.roleNameZh || u.role || '—'}</div>
                  </div>
                  {assigning === u.id ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>分配中…</span> : <UserPlus size={14} style={{ color: 'var(--color-primary)' }} />}
                </button>
              ))}
            </div>

            <div style={drawerFooter}>
              <button onClick={() => setAssignDrawer(false)} style={{ ...secondaryActionButton, flex: 1, justifyContent: 'center' }}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600,
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.3,
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', whiteSpace: 'nowrap',
  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240,
};

export default OrgMembersPanel;
