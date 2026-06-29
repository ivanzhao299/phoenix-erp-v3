'use client';

/**
 * /profile — 个人中心
 *
 * 含 4 个 section：
 *   · 基本信息（real_name / email / phone / locale，只读展示 + 可改）
 *   · 主题偏好（6 套主题选择 + 浅/深状态联动）
 *   · 修改密码
 *   · 我的角色（含可见性标识，只读）
 *
 * 主题统一由 ThemeContext 持久化(localStorage 'phoenix_theme')并写 data-theme;
 * 本页主题卡片只调用 toggleTheme(),不自管持久化/DOM(2026-06-27 统一)。
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import PageHeader from '@/components/PageHeader';
import {
  primaryActionButton, secondaryActionButton, inputField, formLabel,
  inlineBadge, sectionTitle, tableContainer,
} from '@/components/design-system/cockpit-styles';
import { Palette, Check, Lock, User as UserIcon, Shield, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useLanguage } from "@/contexts/LanguageContext";

type Theme = '' | 'dark' | 'brand-green' | 'brand-red' | 'brand-blue' | 'brand-gold';
const THEMES: Array<{ key: Theme; label: string; swatch: string; desc: string }> = [
  { key: '',             label: '默认主题', swatch: 'var(--color-primary)',  desc: '深蓝商务 · 默认' },
  { key: 'dark',         label: '深色模式', swatch: 'var(--brand-deep-1)',   desc: '低亮护眼' },
  { key: 'brand-green',  label: '农牧绿',   swatch: '#2E7D32',                desc: '生产养殖 · 农牧绿' },
  { key: 'brand-red',    label: '食品红',   swatch: '#C62828',                desc: '食品销售 · 红' },
  { key: 'brand-blue',   label: '金融蓝',   swatch: '#1565C0',                desc: '财务结算 · 蓝' },
  { key: 'brand-gold',   label: '品牌金',   swatch: '#B8860B',                desc: '凤凰品牌 · 金' },
];

const tok = () => (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') || '' : '');

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { themeMode, toggleTheme } = useTheme();
  const toast = useToast();

  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // 主题统一走 ThemeContext(唯一写 data-theme 的地方);点击即应用并持久化
  const chooseTheme = (key: Theme) => {
    toggleTheme(key);
    toast.success(t('ui.主题已切换','主题已切换'));
  };

  const changePassword = async () => {
    if (pwNew.length < 8) { toast.error(t('ui.新密码至少 8 位','新密码至少 8 位')); return; }
    if (pwNew !== pwConfirm) { toast.error(t('ui.两次输入的新密码不一致','两次输入的新密码不一致')); return; }
    setPwSaving(true);
    try {
      const userId = (user as any)?.id || (user as any)?.userId;
      if (!userId) { toast.error(t('ui.未找到当前用户 ID','未找到当前用户 ID')); setPwSaving(false); return; }
      const res = await fetch(`/api/system/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ password: pwNew }),
      });
      const json = await res.json();
      if (json.code === 200) {
        toast.success(t('ui.密码已更新，下次登录请使用新密码','密码已更新，下次登录请使用新密码'));
        setPwOld(''); setPwNew(''); setPwConfirm('');
      } else {
        toast.error(json.msg || t('ui.密码修改失败','密码修改失败'));
      }
    } catch { toast.error(t('ui.网络错误','网络错误')); }
    finally { setPwSaving(false); }
  };

  // 从 JWT/user 中取角色列表（visibleRoles 优先，回退 roles）
  const visibleRoles = (user as any)?.visibleRoles || [];
  const allRoles = (user as any)?.roles || [];
  // 隐藏角色 = 在 allRoles 但不在 visibleRoles
  const hiddenRoleCodes = allRoles.filter((rc: string) => !visibleRoles.some((vr: any) => vr.role_code === rc));

  // 用户类型 + 绑定数据（生产/销售人员显示不同卡片）
  const userKind: 'production' | 'store' | 'office' = (user as any)?.userKind || 'office';
  const primaryOrg = (user as any)?.primaryOrg || null;
  const boundSites = (user as any)?.boundSites || [];
  const boundFarmCodes = (user as any)?.boundFarmCodes || [];
  const storeCode = (user as any)?.storeCode || (user as any)?.store_code || '';
  // 所属组织：取 primaryOrg 的中文名；若拿不到，回退到 storeCode（避免显示"全局"）
  const orgDisplay = primaryOrg?.org_name
    ? `${primaryOrg.org_name}（${primaryOrg.org_code}）`
    : (storeCode && storeCode !== 'ALL' ? storeCode : '—');
  // 生产/销售人员的"绑定"字段
  const isProduction = userKind === 'production';
  const isStore = userKind === 'store';
  // 主站点（SITE 类型组织）
  const primarySite = boundSites[0] || null;
  const siteDisplay = primarySite
    ? `${primarySite.site_name}（${primarySite.site_code}）`
    : (storeCode && storeCode !== 'ALL' ? storeCode : '—');
  const farmDisplay = boundFarmCodes.length > 0
    ? boundFarmCodes.join(' / ')
    : '—';

  return (
    <div>
      <PageHeader
        title={t('ui.个人中心','个人中心')}
        subtitle={t('ui.个人信息 · 主题偏好 · 修改密码 · 我的角色','个人信息 · 主题偏好 · 修改密码 · 我的角色')}
        breadcrumb={[t('ui.个人中心','个人中心')]}
      />

      {/* 1. 基本信息 */}
      <div style={{ ...tableContainer, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ ...sectionTitle, marginTop: 0 }}>
          <UserIcon size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          {t('ui.基本信息','基本信息')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <ReadOnlyField label={t('ui.姓名','姓名')} value={(user as any)?.realNameZh || (user as any)?.name || '—'} />
          <ReadOnlyField label={t('ui.账号','账号')} value={(user as any)?.username || '—'} />
          <ReadOnlyField label={t('ui.系统角色','系统角色')} value={(user as any)?.roleNameZh || '—'} />
          <ReadOnlyField label={t('ui.所属组织','所属组织')} value={orgDisplay} />
          {isProduction && (
            <ReadOnlyField label={t('ui.绑定生产站点','绑定生产站点')} value={siteDisplay} />
          )}
          {isStore && (
            <ReadOnlyField label={t('ui.绑定门店','绑定门店')} value={storeCode || '—'} />
          )}
          {!isProduction && !isStore && (
            <ReadOnlyField label={t('ui.所属站点','所属站点')} value={storeCode || '—'} />
          )}
          <ReadOnlyField label={t('ui.语言偏好','语言偏好')} value={(user as any)?.locale || 'zh-CN'} />
        </div>

        {/* 数据范围：生产人员单独 section 展示场站 + 鸡舍范围 */}
        {isProduction && (
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg-muted)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', marginBottom: 8 }}>
              {t('ui.数据范围（仅可访问以下范围内的生产数据）','数据范围（仅可访问以下范围内的生产数据）')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('ui.公司：','公司：')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{primaryOrg?.org_name || '—'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('ui.养殖场：','养殖场：')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{farmDisplay}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('ui.鸡舍：','鸡舍：')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {boundFarmCodes.length > 0 ? t('ui.1-6 号鸡舍（按场站主数据）','1-6 号鸡舍（按场站主数据）') : '—'}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {t('ui.说明：你仅能查看 / 录入 / 提交本养殖场内的生产数据；不可跨场查看东鹏、万象等其它养殖场。','说明：你仅能查看 / 录入 / 提交本养殖场内的生产数据；不可跨场查看东鹏、万象等其它养殖场。')}
            </div>
          </div>
        )}
      </div>

      {/* 2. 主题偏好 */}
      <div style={{ ...tableContainer, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ ...sectionTitle, marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            <Palette size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
            {t('ui.主题偏好','主题偏好')}
          </span>
          <button
            onClick={() => toggleTheme(themeMode === 'dark' ? 'light' : 'dark')}
            style={{ ...secondaryActionButton, padding: '6px 12px', fontSize: 12 }}
          >
            {themeMode === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            {themeMode === 'dark' ? t('ui.切到浅色','切到浅色') : t('ui.切到深色','切到深色')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {t('ui.挑选最适合你的视觉风格，主题会立即应用并记住你的选择。','挑选最适合你的视觉风格，主题会立即应用并记住你的选择。')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {THEMES.map(t => {
            const active = themeMode === t.key;
            return (
              <button
                key={t.key}
                onClick={() => chooseTheme(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  border: active ? `2px solid ${t.swatch}` : '1px solid var(--border)',
                  borderRadius: 12, background: 'var(--bg-card)',
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: active ? `0 0 0 4px ${t.swatch}22` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: t.swatch, flexShrink: 0,
                              border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <Check size={16} color="white" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 修改密码 */}
      <div style={{ ...tableContainer, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ ...sectionTitle, marginTop: 0 }}>
          <Lock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          {t('ui.修改密码','修改密码')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <label style={formLabel}>{t('ui.当前密码','当前密码')}</label>
            <input type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} style={inputField} autoComplete="current-password" />
          </div>
          <div>
            <label style={formLabel}>{t('ui.新密码（至少 8 位）','新密码（至少 8 位）')}</label>
            <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} style={inputField} autoComplete="new-password" />
          </div>
          <div>
            <label style={formLabel}>{t('ui.确认新密码','确认新密码')}</label>
            <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} style={inputField} autoComplete="new-password" />
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={changePassword} disabled={pwSaving || !pwNew} style={{ ...primaryActionButton, opacity: pwSaving || !pwNew ? 0.6 : 1 }}>
            <Lock size={13} />
            {pwSaving ? t('ui.保存中…','保存中…') : t('ui.更新密码','更新密码')}
          </button>
        </div>
      </div>

      {/* 4. 我的角色 */}
      <div style={{ ...tableContainer, padding: '20px 24px' }}>
        <div style={{ ...sectionTitle, marginTop: 0 }}>
          <Shield size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          {t('ui.我的角色（','我的角色（')}{allRoles.length}{t('ui.）','）')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {visibleRoles.length === 0 && allRoles.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('ui.暂无角色绑定','暂无角色绑定')}</span>
          )}
          {visibleRoles.map((r: any) => (
            <span key={r.role_code} style={inlineBadge(r.is_primary ? 'success' : 'default')}>
              <Eye size={11} style={{ marginRight: 4 }} />
              {r.role_name_zh}
              {r.is_primary && <span style={{ marginLeft: 4, fontWeight: 800 }}>{t('ui.·主','·主')}</span>}
            </span>
          ))}
          {hiddenRoleCodes.map((rc: string) => (
            <span key={rc} style={{ ...inlineBadge('default'), opacity: 0.55, textDecoration: 'line-through' }}>
              <EyeOff size={11} style={{ marginRight: 4 }} />
              {rc}
              <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-secondary)' }}>{t('ui.（前台已隐藏）','（前台已隐藏）')}</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.7 }}>
          {t('ui.说明：被隐藏的角色仍然在权限计算中生效，仅不在前台显示角色名，避免身份误会。 需要调整可见性请联系管理员（系统设置 → 用户管理）。','说明：被隐藏的角色仍然在权限计算中生效，仅不在前台显示角色名，避免身份误会。 需要调整可见性请联系管理员（系统设置 → 用户管理）。')}
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label style={formLabel}>{label}</label>
      <div style={{ ...inputField, background: 'var(--bg-muted)', color: 'var(--text-secondary)', cursor: 'default' }}>
        {value}
      </div>
    </div>
  );
}
