'use client';

import { useState, useEffect } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { packagingApi } from '@/lib/packaging-api';
import { T } from '@/styles/terminal-theme';
import styles from './shift-open.module.css';
const CHECK_ITEMS = [{
  key: 'scanner',
  label: '扫码枪在线',
  icon: '📷'
}, {
  key: 'printer',
  label: '标签打印机在线',
  icon: '🖨️'
}, {
  key: 'scale',
  label: '电子秤在线',
  icon: '⚖️'
}, {
  key: 'grader',
  label: '分级机在线/人工模式确认',
  icon: '⚙️'
}, {
  key: 'network',
  label: '网络在线或离线缓存可用',
  icon: '🌐'
}, {
  key: 'hygiene',
  label: '包装区域卫生已确认',
  icon: '✅'
}, {
  key: 'materials',
  label: '空箱/蛋托/标签等包材已准备',
  icon: '📦'
}];
const CHECK_ITEM_KEYS: Record<string, string> = {
  scanner: 'ui.扫码枪在线',
  printer: 'ui.标签打印机在线',
  scale: 'ui.电子秤在线',
  grader: 'ui.分级机在线人工模式确认',
  network: 'ui.网络在线或离线缓存可用',
  hygiene: 'ui.包装区域卫生已确认',
  materials: 'ui.空箱蛋托标签等包材已准备'
};
interface PackLine {
  code: string;
  label: string;
}
interface Supervisor {
  id: number;
  name: string;
}
interface ShiftTypeItem {
  code: string;
  label: string;
  timeRange?: string;
}
export default function ShiftOpenPage() {
  const router = useRouter();
  const {
    user
  } = useAuth();
  const {
    t
  } = useLanguage();
  const ctx = useTerminalContext();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [packLines, setPackLines] = useState<PackLine[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeItem[]>([]);
  const [line, setLine] = useState('');
  const [shiftType, setShiftType] = useState('');
  // R3：真实场站（开班必选，替代默认 site-01）
  const [sites, setSites] = useState<{
    site_id: string;
    site_name: string;
  }[]>([]);
  const [siteId, setSiteId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [offline, setOffline] = useState<string[]>([]);
  const [offlineReason, setOfflineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    // R3：加载真实场站
    packagingApi.getSites().then(list => {
      const arr = Array.isArray(list) ? list : [];
      setSites(arr);
      if (arr.length > 0) setSiteId(prev => prev || arr[0].site_id);
    }).catch(() => setSites([]));
    packagingApi.getDicts(['PKG_PACK_LINE', 'PKG_SHIFT']).then(d => {
      const lines = (d.PKG_PACK_LINE || []).map(i => ({
        code: i.code,
        label: i.label
      }));
      setPackLines(lines);
      if (lines.length > 0 && !line) setLine(lines[0].code);
      const types = (d.PKG_SHIFT || []).map(i => ({
        code: i.code,
        label: i.label,
        timeRange: i.timeRange as string | undefined ?? ''
      }));
      setShiftTypes(types);
      if (types.length > 0 && !shiftType) setShiftType(types[0].code);
    }).catch(() => {
      const fallbackLines = [{
        code: 'LINE-01',
        label: t('ui.1号包装线', '1号包装线')
      }, {
        code: 'LINE-02',
        label: t('ui.2号包装线', '2号包装线')
      }];
      setPackLines(fallbackLines);
      if (!line) setLine(fallbackLines[0].code);
      const fallbackTypes = [{
        code: 'MORNING',
        label: t('ui.早班', '早班'),
        timeRange: '08:00-14:00'
      }, {
        code: 'AFTERNOON',
        label: t('ui.下午班', '下午班'),
        timeRange: '14:00-22:00'
      }, {
        code: 'NIGHT',
        label: t('ui.夜班', '夜班'),
        timeRange: '22:00-06:00'
      }];
      setShiftTypes(fallbackTypes);
      if (!shiftType) setShiftType('MORNING');
    });
    packagingApi.getSupervisors().then(list => {
      setSupervisors(list);
      if (list.length > 0 && !supervisor) {
        // pre-select the logged-in user if they are in the list
        const match = list.find(s => s.name === user?.name);
        setSupervisor(match ? match.name : list[0].name);
      }
    }).catch(() => {
      // fallback: allow free-text entry seeded from current user
      if (!supervisor) setSupervisor(user?.name || '');
    });
    // mount-only: pre-selects line/supervisor from dict; including them as deps
    // would re-run the effect after they're set, overwriting user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleCheck = (key: string) => {
    setChecks(prev => {
      const next = {
        ...prev,
        [key]: !prev[key]
      };
      if (!next[key]) setOffline(o => [...new Set([...o, key])]);else setOffline(o => o.filter(k => k !== key));
      return next;
    });
  };
  const allChecked = CHECK_ITEMS.every(i => checks[i.key]);
  const canSubmit = !!siteId && CHECK_ITEMS.filter(i => !['grader', 'scale'].includes(i.key)).every(i => checks[i.key]);
  const lineName = packLines.find(l => l.code === line)?.label ?? line;

  // 把 API 返回的原始班次对象映射为 WorkShift 格式并写入 context
  const applyShiftToContext = (raw: Record<string, any>) => {
    if (!raw || !ctx?.setShift) return;
    ctx.setShift({
      id: String(raw.id ?? ''),
      code: raw.shift_code ?? raw.code ?? '',
      shiftType: raw.shift_type ?? shiftType,
      productionDate: raw.production_date ?? '',
      siteId: raw.site_id ?? siteId,
      siteName: raw.site_name ?? '',
      lineId: raw.line_id ?? line,
      lineName: raw.line_name ?? lineName,
      operatorIds: raw.operator_id ? [String(raw.operator_id)] : [],
      operatorNames: raw.operator_name ? [raw.operator_name] : [],
      supervisorId: raw.supervisor_id ? String(raw.supervisor_id) : undefined,
      supervisorName: raw.supervisor_name ?? supervisor,
      terminalId: raw.terminal_id ?? 'T-01',
      status: raw.status ?? 'OPEN',
      openedAt: raw.opened_at ?? new Date().toISOString(),
      hygieneCheckResult: checks['hygiene'] ?? true,
      deviceCheckResult: checks['scanner'] ?? true
    });
  };
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      const raw = await packagingApi.openShift({
        lineId: line,
        shiftType,
        supervisorName: supervisor,
        siteId
      });
      applyShiftToContext(raw);
      setDone(true);
      setTimeout(() => router.push('/terminal/packaging/dashboard'), 1500);
    } catch (err: any) {
      setSubmitError(err?.message || t('ui.开班失败请重试', '开班失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };
  if (done) return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: T.BG,
    gap: 16
  }}>
      <div className={styles.content} style={{
      fontSize: 64
    }}>✅</div>
      <div style={{
      fontSize: 24,
      fontWeight: 700,
      color: T.GRN
    }}>{t('ui.开班成功', '开班成功')}</div>
      <div style={{
      color: T.MUT
    }}>{t('ui.正在返回作业台首页', '正在返回作业台首页...')}</div>
    </div>;
  return <div style={{
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: T.BG,
    overflow: 'hidden'
  }}>
      {/* 页头 */}
      <div style={{
      background: T.CARD,
      borderBottom: `1px solid ${T.BOR}`,
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0
    }}>
        <span className={u.fs24}>🔓</span>
        <div className={u.flex1}>
          <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: T.TXT
        }}>{t('terminal.shift_open', '开班 / 设备点检')}</div>
          <div style={{
          fontSize: 12,
          color: T.MUT
        }}>{t('ui.完成点检后方可开始作业', '完成点检后方可开始作业')}</div>
        </div>
      </div>

      <div style={{
      flex: 1,
      overflow: 'hidden',
      minHeight: 0,
      padding: 24,
      display: 'flex',
      gap: 24
    }}>
        {/* 左：班次信息 */}
        <div className={styles.infoColumn} style={{
        width: 280,
        flexShrink: 0
      }}>
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 20,
          border: `1px solid ${T.BOR}`
        }}>
            <div style={{
            fontSize: 13,
            color: T.MUT,
            marginBottom: 16,
            fontWeight: 600
          }}>{t('ui.班次基本信息', '班次基本信息')}</div>
            <div className={u.mb12}>
              <div style={{
              fontSize: 11,
              color: T.MUT,
              marginBottom: 4
            }}>{t('ui.生产日期', '生产日期')}</div>
              <div style={{
              background: 'var(--overlay-white-05)',
              borderRadius: 6,
              padding: '8px 12px',
              color: T.TXT,
              fontSize: 14
            }}>
                {new Date().toLocaleDateString('zh-CN')}
              </div>
            </div>
            <div className={u.mb12}>
              <div style={{
              fontSize: 11,
              color: T.MUT,
              marginBottom: 4
            }}>{t('ui.班次类型', '班次类型')}</div>
              <div style={{
              display: 'flex',
              gap: 8
            }}>
                {(shiftTypes.length > 0 ? shiftTypes : [{
                code: 'MORNING',
                label: t('ui.早班', '早班')
              }, {
                code: 'AFTERNOON',
                label: t('ui.下午班', '下午班')
              }, {
                code: 'NIGHT',
                label: t('ui.夜班', '夜班')
              }]).map(st => {
                const active = shiftType === st.code;
                return <button key={st.code} type="button" onClick={() => setShiftType(st.code)} style={{
                  flex: 1,
                  padding: '12px 6px',
                  borderRadius: 8,
                  border: 'none',
                  background: active ? T.ACC : 'var(--overlay-white-07)',
                  color: active ? 'var(--bg-page)' : T.TXT,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4
                }}>
                      <span style={{
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1
                  }}>{st.label}</span>
                      {st.timeRange && <span style={{
                    fontSize: 11,
                    opacity: active ? 0.7 : 0.45,
                    lineHeight: 1
                  }}>
                          {st.timeRange}
                        </span>}
                    </button>;
              })}
              </div>
            </div>

            {/* R3：场站（必选，写入 pkg_work_shifts.site_id，驱动 SITE 级灰度） */}
            <div className={u.mb12}>
              <div style={{
              fontSize: 11,
              color: T.MUT,
              marginBottom: 4
            }}>{t('ui.场站', '场站')}</div>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${T.BOR}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: T.TXT,
              fontSize: 14
            }}>
                {sites.length === 0 && <option value="">{t('ui.（无可选场站）', '（无可选场站）')}</option>}
                {sites.map(s => <option key={s.site_id} value={s.site_id}>{s.site_name}（{s.site_id}）</option>)}
              </select>
            </div>
            <div className={u.mb12}>
              <div style={{
              fontSize: 11,
              color: T.MUT,
              marginBottom: 4
            }}>{t('ui.产线', '产线')}</div>
              <select value={line} onChange={e => setLine(e.target.value)} style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${T.BOR}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: T.TXT,
              fontSize: 14
            }}>
                {packLines.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className={u.mb12}>
              <div style={{
              fontSize: 11,
              color: T.MUT,
              marginBottom: 4
            }}>{t('ui.班组长', '班组长')}</div>
              {supervisors.length > 0 ? <select value={supervisor} onChange={e => setSupervisor(e.target.value)} style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${T.BOR}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: T.TXT,
              fontSize: 14
            }}>
                  {supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select> : <input value={supervisor} onChange={e => setSupervisor(e.target.value)} style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${T.BOR}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: T.TXT,
              fontSize: 14,
              boxSizing: 'border-box'
            }} />}
            </div>
          </div>
        </div>

        {/* 右：点检清单 */}
        <div className={u.flex1}>
          <div style={{
          background: T.CARD,
          borderRadius: 12,
          padding: 20,
          border: `1px solid ${T.BOR}`
        }}>
            <div style={{
            fontSize: 13,
            color: T.MUT,
            marginBottom: 16,
            fontWeight: 600
          }}>{t('ui.设备与卫生点检', '设备与卫生点检')}</div>
            <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
              {CHECK_ITEMS.map(item => {
              const checked = !!checks[item.key];
              return <button type="button" key={item.key} onClick={() => toggleCheck(item.key)} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 20px',
                background: checked ? 'var(--status-success-bg-faint)' : 'var(--overlay-white-03)',
                border: `2px solid ${checked ? 'var(--status-success-bg-strong-2)' : T.BOR}`,
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s'
              }}>
                    <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: checked ? T.GRN : T.BOR,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  flexShrink: 0,
                  transition: 'all 0.15s'
                }}>
                      {checked ? '✓' : ''}
                    </div>
                    <span className={u.fs18}>{item.icon}</span>
                    <span style={{
                  fontSize: 15,
                  color: checked ? T.GRN : T.TXT,
                  fontWeight: checked ? 600 : 400
                }}>
                      {t(CHECK_ITEM_KEYS[item.key], item.label)}
                    </span>
                  </button>;
            })}
            </div>

            <div style={{
            marginTop: 16,
            overflow: 'hidden',
            maxHeight: offline.length > 0 ? 200 : 0,
            flexShrink: 0
          }}>
              <div style={{
              fontSize: 12,
              color: 'var(--status-warning)',
              marginBottom: 6
            }}>
                {t('ui.设备离线请说明原因', '以下设备离线，请说明原因（允许以人工模式继续）：')}
              </div>
              <textarea value={offlineReason} onChange={e => setOfflineReason(e.target.value)} placeholder={t('ui.设备离线原因示例', '例：电子秤故障，已联系维修，本班手工称重...')} rows={3} style={{
              width: '100%',
              background: 'var(--status-warning-bg-faint)',
              border: `1px solid var(--status-warning-bg-strong)`,
              borderRadius: 8,
              padding: '10px 12px',
              color: T.TXT,
              fontSize: 13,
              resize: 'none',
              boxSizing: 'border-box'
            }} />
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作 */}
      <div style={{
      background: T.CARD,
      borderTop: `1px solid ${T.BOR}`,
      padding: '16px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      flexShrink: 0
    }}>
        {submitError && <div style={{
        background: 'var(--status-danger-bg-light)',
        border: '1px solid var(--status-danger-bg-strong)',
        borderRadius: 8,
        padding: '10px 16px',
        fontSize: 14,
        color: T.RED,
        fontWeight: 500
      }}>
            ⚠️ {shiftTypes.reduce((msg, st) => msg.replace(new RegExp(st.code, 'g'), st.label), submitError)}
          </div>}
        <div className={u.flexRow12}>
        <div style={{
          flex: 1,
          fontSize: 13,
          color: allChecked ? T.GRN : T.MUT
        }}>
          {allChecked ? `✅ ${t('ui.点检完成可以开班', '点检完成，可以开班')}` : `${t('ui.还剩', '还剩')} ${CHECK_ITEMS.filter(i => !checks[i.key]).length} ${t('ui.项未确认', '项未确认')}`}
        </div>
        <button type="button" onClick={() => router.push('/terminal/packaging/dashboard')} style={{
          padding: '14px 28px',
          borderRadius: 10,
          border: `1px solid ${T.BOR}`,
          background: 'transparent',
          color: T.MUT,
          fontSize: 15,
          cursor: 'pointer'
        }}>
          {t('common.back', '返回')}
        </button>
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting} style={{
          padding: '14px 40px',
          borderRadius: 10,
          border: 'none',
          background: canSubmit ? T.ACC : T.BOR,
          color: canSubmit ? 'var(--bg-page)' : T.MUT,
          fontSize: 16,
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.7 : 1,
          transition: 'all 0.15s'
        }}>
          {submitting ? t('ui.开班中', '开班中...') : t('ui.确认开班', '确认开班')}
        </button>
        </div>
      </div>
    </div>;
}
