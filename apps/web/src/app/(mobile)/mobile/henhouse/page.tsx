'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Sun, Moon, Building2 } from 'lucide-react';
import { mobileApi, invalidateCache } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';

interface HouseRow {
  house_code: string;
  house_name: string;
  capacity?: number | null;
  house_type?: string | null;
  current_birds?: number | null;
}

export default function HenHouseMobilePage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { t: tr } = useLanguage();
  // G109：鸡舍管理——场长可建本场鸡舍(write)，其余只读(read)；无权限自动跳回首页
  const { allowed, loading: permLoading, readonly } = useMobilePermission('henhouse');

  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ house_code: '', house_name: '', capacity: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await mobileApi.getFeedHousesDetail();
      setHouses(Array.isArray(rows) ? rows : []);
    } catch { setHouses([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const submit = async () => {
    setError('');
    if (!form.house_code.trim() || !form.house_name.trim()) { setError(tr('mob.brd.house_code_name_required', '鸡舍编码和名称必填')); return; }
    setSaving(true);
    try {
      const res = await mobileApi.createHouse({
        house_code: form.house_code.trim(),
        house_name: form.house_name.trim(),
        capacity: Number(form.capacity) || 0,
      });
      if (res.code === 200) {
        setShowForm(false);
        setForm({ house_code: '', house_name: '', capacity: '' });
        invalidateCache('feedHousesDetail');   // 失效缓存后重拉，立即看到新舍
        await load();
      } else {
        setError(res.msg || tr('mob.brd.create_house_fail', '建鸡舍失败'));
      }
    } catch { setError(tr('mob.brd.network_error_retry', '网络错误，请重试')); }
    finally { setSaving(false); }
  };

  if (permLoading || !allowed) {
    return <div style={{ minHeight: '100svh', background: t.pageBg }} />;
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.text,
    fontSize: 14, outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: t.textSub, marginBottom: 5, display: 'block' };

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: t.appBarBg, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>🏠 {tr('mob.brd.house_mgmt', '鸡舍管理')}</span>
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 新建按钮（仅 write 权） */}
        {!readonly && !showForm && (
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '12px', borderRadius: 12, border: `1px dashed ${t.inputBorder}`,
            background: t.sectionBg, color: 'var(--status-success)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={18} /> {tr('mob.brd.new_local_house', '新建本场鸡舍')}
          </button>
        )}

        {/* 新建表单 */}
        {!readonly && showForm && (
          <div style={{ padding: 14, borderRadius: 14, background: t.sectionBg, border: `1px solid ${t.cardBorder}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{tr('mob.brd.new_house', '新建鸡舍')}</div>
            <div>
              <label style={labelStyle}>{tr('mob.brd.house_code_label', '鸡舍编码 *（如 LPH_MS_H7）')}</label>
              <input style={inputStyle} value={form.house_code} onChange={e => setForm(f => ({ ...f, house_code: e.target.value }))} placeholder={tr('mob.brd.local_unique_code', '本场唯一编码')} />
            </div>
            <div>
              <label style={labelStyle}>{tr('mob.brd.house_name_label', '鸡舍名称 *（中文，如 7号鸡舍）')}</label>
              <input style={inputStyle} value={form.house_name} onChange={e => setForm(f => ({ ...f, house_name: e.target.value }))} placeholder={tr('mob.brd.display_cn_name', '显示用中文名')} />
            </div>
            <div>
              <label style={labelStyle}>{tr('mob.brd.design_capacity', '设计容量（羽）')}</label>
              <input type="number" inputMode="numeric" min="0" style={inputStyle} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="0" />
            </div>
            <div style={{ fontSize: 11, color: t.textFaint }}>{tr('mob.brd.auto_bind_org', '所属农场/场区/公司由系统按您的归属自动绑定，无需选择。')}</div>
            {error && <div style={{ fontSize: 12, color: 'var(--status-danger)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1px solid ${t.btnBorder}`, background: t.btnBg, color: t.textSub, fontSize: 14, cursor: 'pointer' }}>{tr('mob.brd.cancel', '取消')}</button>
              <button onClick={() => void submit()} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? 'var(--status-success-bg-strong)' : 'var(--status-success)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                {saving ? tr('mob.brd.saving', '保存中…') : tr('mob.brd.save_house', '保存鸡舍')}
              </button>
            </div>
          </div>
        )}

        {/* 鸡舍列表 */}
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{tr('mob.brd.local_houses', '本场鸡舍')}（{houses.length}）</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: t.textMuted }}>{tr('mob.brd.loading', '加载中…')}</div>
        ) : houses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, fontSize: 13, color: t.textFaint }}>
            <Building2 size={32} style={{ opacity: 0.4 }} /><div style={{ marginTop: 8 }}>{tr('mob.brd.no_local_house', '本场暂无鸡舍')}{!readonly ? tr('mob.brd.click_new_to_create', '，点上方「新建」创建') : ''}</div>
          </div>
        ) : (
          houses.map(h => (
            <div key={h.house_code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: t.sectionBg, border: `1px solid ${t.cardBorder}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{h.house_name || h.house_code}</div>
                <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{tr('mob.brd.code', '编码')} {h.house_code}{h.house_type ? ` · ${h.house_type}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>{(h.capacity ?? 0).toLocaleString()} {tr('mob.brd.bird_unit', '羽')}</div>
                <div style={{ fontSize: 10, color: t.textFaint }}>{tr('mob.brd.design_capacity_short', '设计容量')}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
