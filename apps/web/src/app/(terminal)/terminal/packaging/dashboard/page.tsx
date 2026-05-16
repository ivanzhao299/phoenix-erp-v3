'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';
import type { DeviceStatus, SourceBatch } from '@/types/packaging-terminal';
import { BATCH_STATUS_LABEL } from '@/types/packaging-terminal';

const BG='#0f172a', CARD='#1e293b', BOR='#334155';
const ACC='#f59e0b', TXT='#f1f5f9', MUT='#94a3b8', GRN='#22c55e', RED='#ef4444';

const DEVICE_COLOR: Record<string, string> = {
  ONLINE: GRN, OFFLINE: RED, ERROR: RED, UNKNOWN: MUT,
};

interface QuickAction {
  label: string; sub: string; icon: string;
  path: string; color: string; disabled?: boolean;
}

export default function TerminalDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [ctx, setCtx] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    packagingApi.getContext().then((raw) => {
      if (!raw) { setCtx(raw); return; }
      // 把 snake_case API 字段规范化为 dashboard 期望的 camelCase 格式
      const s = raw.currentShift;
      const b = raw.currentSourceBatch;
      setCtx({
        ...raw,
        currentShift: s ? {
          ...s,
          code:          s.shift_code ?? s.code,
          productionDate: s.production_date,
          siteId:        s.site_id,
          siteName:      s.site_name ?? '凤凰农业',
          lineId:        s.line_id,
          lineName:      s.line_name ?? s.line_id,
          operatorIds:   s.operator_id ? [String(s.operator_id)] : [],
          operatorNames: s.operator_name ? [s.operator_name] : [],
          supervisorName: s.supervisor_name,
          status:        s.status,
          openedAt:      s.opened_at,
        } : null,
        currentSourceBatch: b ? {
          ...b,
          code:           b.batch_code ?? b.code,
          houseCode:      b.house_code,
          houseName:      b.house_name ?? b.house_code,
          flockCode:      b.flock_code,
          flockName:      b.flock_name ?? b.flock_code,
          layDate:        b.lay_date ? new Date(b.lay_date).toLocaleDateString('zh-CN') : '',
          collectionTime: b.received_at ? new Date(b.received_at).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) : '',
          expectedQty:    b.expected_qty,
          expectedWeight: b.expected_weight,
          receivedQty:    b.received_qty,
          status:         b.batch_status ?? b.status,
        } : null,
      });
    }).catch(() => {}).finally(() => setLoading(false));
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const shift = ctx?.currentShift;
  const batch = ctx?.currentSourceBatch;
  const exceptions = ctx?.openExceptionCount ?? 0;

  const ACTIONS: QuickAction[] = [
    { label: t('terminal.shift_open', '开班点检'), sub: shift ? `${t('ui.班次', '班次')} ${shift.code}` : t('ui.今日未开班', '今日未开班'), icon: '🔓',
      path: '/terminal/packaging/shift-open', color: shift ? '#334155' : ACC },
    { label: t('terminal.source_receive', '接收批次'), sub: t('ui.扫码接收来源批次', '扫码接收来源批次'), icon: '📥',
      path: '/terminal/packaging/source-receive', color: CARD, disabled: !shift },
    { label: t('terminal.qc_inspection', '首检录入'), sub: t('ui.QC放行审核', 'QC 放行审核'), icon: '🔍',
      path: '/terminal/packaging/qc-inspection', color: CARD, disabled: !shift },
    { label: t('terminal.grading', '分级作业'), sub: t('ui.等级产出记录', '等级产出记录'), icon: '📊',
      path: '/terminal/packaging/grading', color: CARD, disabled: !shift },
    { label: t('terminal.packing', '包装作业'), sub: t('ui.规格卡片操作', '规格卡片操作'), icon: '📦',
      path: '/terminal/packaging/packing', color: CARD, disabled: !shift },
    { label: t('terminal.label_print', '标签打印'), sub: t('ui.打印补打标签', '打印/补打标签'), icon: '🏷️',
      path: '/terminal/packaging/label-print', color: CARD, disabled: !shift },
    { label: t('terminal.warehouse_handover', '成品入库'), sub: t('ui.扫码入库交接', '扫码入库交接'), icon: '🏭',
      path: '/terminal/packaging/warehouse-handover', color: CARD, disabled: !shift },
    { label: t('terminal.exceptions', '异常上报'), sub: exceptions > 0 ? `${exceptions} ${t('ui.条未处理', '条未处理')}` : t('ui.快速上报异常', '快速上报异常'), icon: '⚠️',
      path: '/terminal/packaging/exceptions', color: exceptions > 0 ? '#3b1515' : CARD },
    { label: t('terminal.shift_close', '交班日报'), sub: t('ui.提交班次汇总', '提交班次汇总'), icon: '📋',
      path: '/terminal/packaging/shift-close', color: CARD, disabled: !shift },
  ];

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:BG, overflow:'hidden' }}>
      {/* 顶部状态栏 */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BOR}`, padding:'10px 20px', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:TXT }}>
            {shift ? `${shift.siteName} · ${shift.lineName}` : t('terminal.dashboard', '凤凰农业 — 分级包装作业台')}
          </div>
          <div style={{ fontSize:12, color:MUT, marginTop:2 }}>
            {shift
              ? `${t('ui.班次', '班次')} ${shift.code} · ${shift.operatorNames?.join('、')} · ${t('ui.班长', '班长')} ${shift.supervisorName}`
              : t('ui.请先开班', '请先开班')}
          </div>
        </div>

        {/* 设备状态图标 */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {(ctx?.devices || []).map((d: any) => (
            <div key={d.deviceId} title={`${d.label}: ${d.status}`}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:DEVICE_COLOR[d.status] || MUT }} />
              <span style={{ fontSize:8, color:MUT }}>{d.label.slice(0,3)}</span>
            </div>
          ))}
        </div>

        {/* 时钟 */}
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, color:ACC, fontVariantNumeric:'tabular-nums' }}>
            {now.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })}
          </div>
          <div style={{ fontSize:11, color:MUT }}>
            {now.toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'short' })}
          </div>
        </div>
      </div>

      {/* 主体区域 */}
      <div style={{ flex:1, overflow:'auto', padding:16 }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:MUT, fontSize:18 }}>
            {t('common.loading', '加载中...')}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, height:'100%' }}>

            {/* 左列：当前批次卡 + 产出概览 */}
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* 当前批次卡 */}
              <div style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BOR}` }}>
                <div style={{ fontSize:12, color:MUT, marginBottom:8, fontWeight:600, letterSpacing:1 }}>{t('ui.当前来源批次', '当前来源批次')}</div>
                {batch ? (
                  <div>
                    <div style={{ fontSize:20, fontWeight:700, color:ACC, marginBottom:8 }}>{batch.code}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
                      {[
                        [t('ui.鸡舍', '鸡舍'), batch.houseName], [t('ui.鸡群', '鸡群'), batch.flockName],
                        [t('ui.产蛋日期', '产蛋日期'), batch.layDate], [t('ui.接收时间', '接收时间'), batch.collectionTime || '—'],
                        [t('ui.预计数量', '预计数量'), `${batch.expectedQty?.toLocaleString()} ${t('ui.枚', '枚')}`],
                        [t('ui.实收数量', '实收数量'), `${batch.receivedQty?.toLocaleString()} ${t('ui.枚', '枚')}`],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <span style={{ color:MUT }}>{k}：</span>
                          <span style={{ color:TXT }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:10, padding:'6px 10px', borderRadius:6,
                      background:'rgba(34,197,94,0.1)', border:`1px solid rgba(34,197,94,0.3)`,
                      fontSize:12, color:GRN, display:'inline-block' }}>
                      {BATCH_STATUS_LABEL[batch.status as keyof typeof BATCH_STATUS_LABEL]}
                    </div>
                  </div>
                ) : (
                  <div style={{ color:MUT, fontSize:14, padding:'12px 0' }}>{t('ui.暂无活动批次', '暂无活动批次')}</div>
                )}
              </div>

              {/* 今日产出概览 */}
              <div style={{ background:CARD, borderRadius:12, padding:16, border:`1px solid ${BOR}`, flex:1 }}>
                <div style={{ fontSize:12, color:MUT, marginBottom:12, fontWeight:600, letterSpacing:1 }}>{t('ui.今日产出概览', '今日产出概览')}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { label: t('ui.A大码', 'A大码'), value:'2,800', color:'#7c3aed' },
                    { label: t('ui.A中码', 'A中码'), value:'3,200', color:'#2563eb' },
                    { label: t('ui.A小码', 'A小码'), value:'1,600', color:'#059669' },
                    { label: t('ui.B级', 'B级'),   value:'600',   color:'#d97706' },
                    { label: t('ui.已包装', '已包装'), value:`86 ${t('ui.箱', '箱')}`, color:ACC },
                    { label: t('ui.已入库', '已入库'), value:`4 ${t('ui.托', '托')}`,  color:GRN },
                  ].map(item => (
                    <div key={item.label} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8,
                      padding:'10px 12px', borderLeft:`3px solid ${item.color}` }}>
                      <div style={{ fontSize:11, color:MUT }}>{item.label}</div>
                      <div style={{ fontSize:22, fontWeight:700, color:item.color, fontVariantNumeric:'tabular-nums' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 右列：快捷操作按钮 */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gridTemplateRows:'repeat(3,1fr)', gap:10 }}>
              {ACTIONS.map(action => (
                <button
                  key={action.path}
                  onClick={() => !action.disabled && router.push(action.path)}
                  disabled={action.disabled}
                  style={{
                    background: action.disabled ? 'rgba(255,255,255,0.03)' : action.color,
                    border: `1px solid ${action.disabled ? BOR : (action.color === ACC ? ACC : BOR)}`,
                    borderRadius: 12, padding: '12px 8px',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: action.disabled ? 'not-allowed' : 'pointer',
                    opacity: action.disabled ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{action.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: action.disabled ? MUT : TXT }}>
                    {action.label}
                  </span>
                  <span style={{ fontSize: 10, color: MUT, textAlign: 'center', lineHeight: 1.3 }}>
                    {action.sub}
                  </span>
                </button>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* 底部告警栏 */}
      {exceptions > 0 && (
        <div style={{ background:'#3b1515', borderTop:`1px solid #7f1d1d`, padding:'8px 20px',
          display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <span style={{ color:'#fca5a5', fontSize:13 }}>
            {t('ui.存在', '存在')} {exceptions} {t('ui.条未关闭异常请处理后交班', '条未关闭异常，请尽快处理后再交班')}
          </span>
        </div>
      )}
    </div>
  );
}
