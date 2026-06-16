'use client';

import { useEffect, useState } from 'react';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { shareholderApi, ShrProject, CapitalStats, ORG_CODE_LABEL, lbl } from '@/lib/shareholder-api';
const EQ_LABEL: Record<string, string> = {
  CONFIRMED: '已确认股权',
  PROVISIONAL: '暂定股权'
};
const money = (v: number) => v.toLocaleString('zh-CN', {
  minimumFractionDigits: 2
});
export default function ShareholderDashboard() {
  const [projects, setProjects] = useState<ShrProject[]>([]);
  const [scope, setScope] = useState('');
  const [note, setNote] = useState('');
  const [stats, setStats] = useState<CapitalStats | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [pmap, setPmap] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    shareholderApi.dashboard().then(d => {
      setProjects(d.projects || []);
      setScope(d.scope);
      setNote(d.note || '');
    }).catch(e => setErr(e?.message || '加载失败')).finally(() => setLoading(false));
    shareholderApi.capitalStats().then(setStats).catch(() => {});
    shareholderApi.listShareholders().then(s => setNames(Object.fromEntries(s.map(x => [x.shareholderCode, x.shareholderName])))).catch(() => {});
    shareholderApi.listProjects().then(p => setPmap(Object.fromEntries(p.map(x => [x.projectCode, x.projectName])))).catch(() => {});
  }, []);
  return <div className={u.p24}>
      <PageHeader title="股东驾驶舱" />
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 18 }}>
        可见范围：<b>{scope === 'ALL' ? '全部项目' : scope === 'SCOPED' ? '按授权范围' : scope === 'NONE' ? '无授权' : scope}</b>
        {note && <span style={{
        color: 'var(--status-danger)',
        marginLeft: 12
      }}>{note}</span>}
      </p>
      {err && <div style={{
      color: 'var(--status-danger)',
      marginBottom: 12
    }}>{err}</div>}

      {stats && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
      gap: 16,
      marginBottom: 20
    }}>
          <div style={{
        background: 'var(--color-primary)',
        color: 'var(--text-on-dark)',
        borderRadius: 10,
        padding: 18
      }}>
            <div style={{
          fontSize: 12,
          opacity: .85
        }}>本月新增出资（已确认）</div>
            <div style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 4
        }}>¥{money(stats.monthAdded.total)}</div>
            <div style={{
          fontSize: 11,
          opacity: .8,
          marginTop: 2
        }}>{stats.monthAdded.count} 笔</div>
          </div>
          <div style={{
        background: 'var(--bg-card)',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 1px 3px var(--overlay-black-08)'
      }}>
            <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-primary)',
          marginBottom: 8
        }}>股东投入排名</div>
            {stats.shareholderRanking.slice(0, 5).map((r, i) => <div key={r.shareholderCode} style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12.5,
          padding: '3px 0'
        }}>
                <span>{i + 1}. {names[r.shareholderCode] || r.shareholderCode}</span><span className={u.fw600}>¥{money(r.total)}</span>
              </div>)}
            {stats.shareholderRanking.length === 0 && <div style={{
          color: 'var(--text-disabled)',
          fontSize: 12
        }}>暂无数据</div>}
          </div>
          <div style={{
        background: 'var(--bg-card)',
        borderRadius: 10,
        padding: 16,
        boxShadow: '0 1px 3px var(--overlay-black-08)'
      }}>
            <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-primary)',
          marginBottom: 8
        }}>项目投入排名</div>
            {stats.projectRanking.slice(0, 5).map((r, i) => <div key={r.projectCode} style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12.5,
          padding: '3px 0'
        }}>
                <span>{i + 1}. {pmap[r.projectCode] || r.projectCode}</span><span className={u.fw600}>¥{money(r.total)}</span>
              </div>)}
            {stats.projectRanking.length === 0 && <div style={{
          color: 'var(--text-disabled)',
          fontSize: 12
        }}>暂无数据</div>}
          </div>
        </div>}

      {loading ? <div>加载中…</div> : <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
      gap: 16
    }}>
          {projects.map(p => <div key={p.projectCode} style={{
        background: 'var(--bg-card)',
        borderRadius: 10,
        borderLeft: '4px solid var(--color-primary)',
        boxShadow: '0 1px 3px var(--overlay-black-08)',
        padding: 18
      }}>
              <div className={u.flexBetween}>
                <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-primary)'
          }}>{p.projectName}</div>
                <span style={{
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
            background: p.equityStatus === 'CONFIRMED' ? 'color-mix(in srgb, var(--status-success) 14%, transparent)' : 'color-mix(in srgb, var(--status-warning) 14%, transparent)',
            color: p.equityStatus === 'CONFIRMED' ? 'var(--status-success)' : 'var(--status-warning)'
          }}>
                  {EQ_LABEL[p.equityStatus] || p.equityStatus}
                </span>
              </div>
              <div style={{
          fontSize: 12,
          color: 'var(--text-disabled)',
          margin: '4px 0 10px'
        }}>{lbl(ORG_CODE_LABEL, p.companyCode)} / {lbl(ORG_CODE_LABEL, p.siteCode)}</div>
              <div style={{
          background: 'var(--bg-muted)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10
        }}>
                <div style={{
            color: 'var(--text-disabled)',
            fontSize: 12
          }}>项目总实缴资本</div>
                <div style={{
            fontSize: 19,
            fontWeight: 700,
            color: 'var(--color-primary)'
          }}>
                  ¥{(p.paidInTotal ?? 0).toLocaleString('zh-CN', {
              minimumFractionDigits: 2
            })}
                </div>
                <div style={{
            fontSize: 11,
            color: 'var(--text-disabled)',
            marginTop: 2
          }}>
                  {(p.contributionCount ?? 0) > 0 ? `逐笔台账 ${p.contributionCount} 笔 · 最近 ${p.lastContributionDate ? String(p.lastContributionDate).slice(0, 10) : '—'}` : '来源：实收资本汇总表'}
                </div>
              </div>
              <div style={{
          display: 'flex',
          gap: 18,
          fontSize: 13
        }}>
                <div><div style={{
              color: 'var(--text-disabled)'
            }}>股东数</div><div className={u.fw600}>{p.holders ?? 0}</div></div>
                <div><div style={{
              color: 'var(--text-disabled)'
            }}>股比合计</div><div className={u.fw600}>{(p.ratioSum ?? 0).toFixed(2)}%</div></div>
              </div>
              <div style={{
          fontSize: 11,
          color: 'var(--text-disabled)',
          marginTop: 10
        }}>实缴口径 · 不显示应缴/未缴</div>
            </div>)}
          {projects.length === 0 && scope !== 'NONE' && <div className={u.muted}>暂无可见项目</div>}
        </div>}
    </div>;
}