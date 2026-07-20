'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronLeft, ChevronRight, RefreshCw, Save } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import styles from './feed.module.css';
import { primaryActionButton, secondaryActionButton, inputField } from '@/components/design-system/cockpit-styles';
import {
  createFeedLedgerSavePayload,
  FeedLedgerRow,
  normalizeFeedLedgerRows,
  unwrapFeedLedgerSaveResponse,
} from '@/lib/feed-ledger';
function tok() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    headers: {
      Authorization: `Bearer ${tok()}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code && body.code !== 200) throw new Error(body.msg || '请求失败');
  return body.data ?? body;
}
async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch((process.env.NEXT_PUBLIC_API_BASE || '') + path, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      Authorization: `Bearer ${tok()}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
const ALERT_COLOR: Record<string, string> = {
  CRITICAL: 'var(--status-danger)',
  WARN: 'var(--status-warning)'
};
export default function FeedLedgerPage() {
  const {
    t
  } = useLanguage();
  // G24-A：PBAC 收口
  // P1-3 修:饲料台账保存调 POST /api/farm/feed/ledger,后端守卫 MENU_BREEDING:E。
  //   原 gate 用 MENU_FARM_FEED(仅 1 角色持有)→ 5 个持 MENU_BREEDING:E 的角色看不到保存按钮且后端会 403 漂移。
  //   对齐到 MENU_BREEDING 与端点守卫一致。
  const { canEdit } = usePermission('MENU_BREEDING');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<FeedLedgerRow[]>([]);
  const [houses, setHouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const isToday = date === today();
  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const [ledger, housesPayload] = await Promise.all([apiFetch<unknown>(`/api/farm/feed/ledger?date=${d}`), apiFetch<unknown>('/api/farm/feed/houses')]);
      setRows(normalizeFeedLedgerRows(ledger));
      setHouses(Array.isArray(housesPayload) ? housesPayload.filter((house): house is string => typeof house === 'string') : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route/date changes intentionally start remote loading
    loadData(date);
  }, [date, loadData]);
  const updateRow = (idx: number, patch: Partial<FeedLedgerRow>) => {
    setRows(prev => {
      const next = [...prev];
      const r = {
        ...next[idx],
        ...patch
      };
      const detail = r.outbound_detail ?? {};
      r.outbound_total = Object.values(detail).reduce((s, v) => s + (Number(v) || 0), 0);
      r.current_stock = Math.max(0, (r.prev_stock ?? 0) + (r.inbound_qty ?? 0) - r.outbound_total);
      r.days_left = r.daily_usage > 0 ? Math.floor(r.current_stock / r.daily_usage) : null;
      r.alert = r.days_left != null && r.days_left <= 7 ? r.days_left <= 3 ? 'CRITICAL' : 'WARN' : null;
      next[idx] = r;
      return next;
    });
    setSaved(false);
  };
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await apiPost<unknown>(
        '/api/farm/feed/ledger',
        createFeedLedgerSavePayload(date, rows),
      );
      setRows(unwrapFeedLedgerSaveResponse(response));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setSaving(false);
    }
  };
  const alertRows = rows.filter(r => r.alert);
  return <div className="animate-fade-in">
      <PageHeader
        title={t('ui.饲料台账', '饲料台账')}
        subtitle={t('ui.每日饲料台账', '每日饲料入库/出库/库存预警 · 直接在表格内编辑当日数据后点"保存"')}
        breadcrumb={[t('ui.养殖生产', '养殖生产'), t('ui.饲料台账', '饲料台账')]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/warehouse/inbound?action=create&type=FEED" style={{ ...primaryActionButton, textDecoration: 'none' }}>
              <Save size={14} />{t('ui.新建饲料入库', '+ 新建饲料入库')}
            </a>
            <a href="/warehouse/outbound?action=create&type=FEED_DISTRIBUTION" style={{ ...secondaryActionButton, textDecoration: 'none' }}>
              {t('ui.新建饲料发放', '+ 新建饲料发放')}
            </a>
          </div>
        }
      />
      {/* G19-B 业务方使用指引 — 解决"涣散无登记入口"困惑 */}
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        💡 <strong>{t('ui.台账使用说明', '使用说明')}：</strong>
        {t('ui.feed指引', '本页是「饲料日台账」— 自动汇总当日入库/出库/库存。要登记新的入库/发放，请点右上"+ 新建饲料入库 / 发放"按钮（走标准 WMS 流程）。已有物料的余量可直接在表格里调整后点"保存"。')}
      </div>

      {/* 工具栏 */}
      <div style={{
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      marginBottom: 20,
      flexWrap: 'wrap'
    }}>
        <button onClick={() => setDate(d => addDays(d, -1))} style={secondaryActionButton}>
          <ChevronLeft size={14} />{t('ui.前一天', '前一天')}
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputField, width: 160 }} />
        <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ ...secondaryActionButton, opacity: isToday ? 0.4 : 1 }}>
          {t('ui.后一天', '后一天')}<ChevronRight size={14} />
        </button>
        <button onClick={() => loadData(date)} style={secondaryActionButton}>
          <RefreshCw size={13} />{t('common.refresh', '刷新')}
        </button>
        <div className={u.flex1} />
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={saving || loading}
            aria-busy={saving}
            style={saved ? secondaryActionButton : primaryActionButton}
          >
            <Save size={14} />
            {saving ? t('ui.保存中', '保存中…') : saved ? t('ui.已保存', '已保存') : t('common.save', '保存')}
          </button>
        )}
      </div>

      {/* 库存预警 */}
      {alertRows.length > 0 && <div style={{
      marginBottom: 16,
      padding: '12px 16px',
      borderRadius: 10,
      background: 'var(--status-danger-bg-faint)',
      border: '1px solid var(--status-danger-bg-medium)'
    }}>
          <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--status-danger)',
        marginBottom: 6
      }}>⚠ {t('ui.库存预警', '库存预警')}</div>
          <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8
      }}>
            {alertRows.map(r => <span key={r.material_name} style={{
          padding: '3px 10px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          background: r.alert === 'CRITICAL' ? 'var(--status-danger-bg-light)' : 'var(--status-warning-bg-light)',
          color: ALERT_COLOR[r.alert!]
        }}>
                {r.material_name} · {r.days_left}{t('ui.天', '天')}
              </span>)}
          </div>
        </div>}

      {error && <div role="alert" style={{
      marginBottom: 14,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--status-danger-bg-faint)',
      border: '1px solid var(--status-danger-bg-medium)',
      color: 'var(--status-danger)',
      fontSize: 13
    }}>
          {t('ui.feed保存失败', '保存失败：')}{error}
        </div>}

      {/* 主表格 */}
      <div className={styles.tableViewport}>
        <table className={`${s.table} ${styles.feedTable}`}>
          <thead>
            <tr>
              <th className={u.nowrap}>{t('ui.物料名称', '物料名称')}</th>
              <th className={styles.alignCenter}>{t('ui.单位', '单位')}</th>
              <th className={styles.alignRight}>{t('ui.昨日库存', '昨日库存')}</th>
              <th className={styles.alignRight}>{t('ui.今日入库', '今日入库')}</th>
              <th className={styles.alignRight}>{t('ui.日用量', '日用量')}</th>
              {houses.map(h => <th key={h} style={{
              textAlign: 'right',
              whiteSpace: 'nowrap'
            }}>{h}</th>)}
              <th className={styles.alignRight}>{t('ui.出库合计', '出库合计')}</th>
              <th className={styles.alignRight}>{t('ui.当前库存', '当前库存')}</th>
              <th className={styles.alignCenter}>{t('ui.可用天', '可用天')}</th>
              <th>{t('ui.备注', '备注')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={10 + houses.length} className={u.emptyCenter}>{t('ui.加载中…', '加载中…')}</td></tr> : rows.length === 0 ? <tr><td colSpan={10 + houses.length} className={u.emptyCenter}>{t('ui.暂无数据', '暂无数据')}</td></tr> : rows.map((row, idx) => {
            const alertColor = row.alert ? ALERT_COLOR[row.alert] : undefined;
            const daysColor = row.days_left == null ? 'var(--text-secondary)' : row.days_left <= 3 ? 'var(--status-danger)' : row.days_left <= 7 ? 'var(--status-warning)' : row.days_left <= 14 ? 'var(--status-warning)' : 'var(--status-success)';
            return <tr key={row.material_name} style={{
              background: alertColor ? `${alertColor}06` : undefined
            }}>
                  <td className={u.nowrap}>
                    {row.material_name}
                    {row.alert && <span style={{
                  marginLeft: 6,
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: `${alertColor}20`,
                  color: alertColor
                }}>
                        {row.alert === 'CRITICAL' ? t('ui.⚠ 紧缺', '⚠ 紧缺') : t('ui.关注', '关注')}
                      </span>}
                  </td>
                  <td style={{
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>{row.unit}</td>
                  <td style={{
                textAlign: 'right',
                color: 'var(--text-secondary)'
              }}>{row.prev_stock.toLocaleString()}</td>
                  <td className={u.tar}>
                    {canEdit ? <input type="number" min="0" value={row.inbound_qty || ''} onChange={e => updateRow(idx, {
                  inbound_qty: Number(e.target.value) || 0
                })} placeholder="0" style={{
                  width: 80,
                  textAlign: 'right',
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : <span style={{
                  color: 'var(--text-primary)',
                  fontWeight: 600
                }}>{row.inbound_qty}</span>}
                  </td>
                  <td className={u.tar}>
                    {canEdit ? <input type="number" min="0" value={row.daily_usage || ''} onChange={e => updateRow(idx, {
                  daily_usage: Number(e.target.value) || 0
                })} placeholder="0" style={{
                  width: 80,
                  textAlign: 'right',
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : <span style={{
                  color: 'var(--text-primary)'
                }}>{row.daily_usage}</span>}
                  </td>
                  {houses.map(h => <td key={h} className={u.tar}>
                      {canEdit ? <input type="number" min="0" value={row.outbound_detail[h] || ''} onChange={e => updateRow(idx, {
                  outbound_detail: {
                    ...row.outbound_detail,
                    [h]: Number(e.target.value) || 0
                  }
                })} placeholder="0" style={{
                  width: 68,
                  textAlign: 'right',
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 13
                }} /> : <span>{row.outbound_detail[h] ?? 0}</span>}
                    </td>)}
                  <td style={{
                textAlign: 'right',
                fontWeight: 700,
                color: 'var(--status-warning)'
              }}>{row.outbound_total.toLocaleString()}</td>
                  <td style={{
                textAlign: 'right',
                fontWeight: 700,
                color: 'var(--status-success)'
              }}>{row.current_stock.toLocaleString()}</td>
                  <td style={{
                textAlign: 'center',
                fontWeight: 700,
                color: daysColor
              }}>
                    {row.days_left != null ? `${row.days_left}${t('ui.天', '天')}` : '—'}
                  </td>
                  <td>
                    {canEdit ? <input type="text" value={row.note} onChange={e => updateRow(idx, {
                  note: e.target.value
                })} placeholder={t('ui.备注…', '备注…')} style={{
                  width: 140,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  fontSize: 12
                }} /> : <span className={u.muted12}>{row.note}</span>}
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>
    </div>;
}
