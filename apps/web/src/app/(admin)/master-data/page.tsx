"use client";

/**
 * G5.5-E — 主数据中心首页 · 运营工作台模式
 * ════════════════════════════════════════════════════
 * · 全局搜索（跨 12 类主数据）
 * · 6 中心运营卡（实时显示 对象数 / 待审批 / 异常 / 健康评分）
 * · 治理 + 运营 入口
 */
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { Network, Building, FolderKanban, ShieldCheck, Users, Globe, Store, Egg, Tag, Package, Layers, Warehouse, UserCheck, Car, Wallet, Banknote, BookOpen, CheckSquare, Activity, LayoutDashboard, RefreshCw, Briefcase } from "lucide-react";
import request from "@/lib/api-client";
import { MasterDataSearch } from "@/components/master-data/MasterDataSearch";
import { secondaryActionButton } from "@/components/design-system/cockpit-styles";
import { LoadingSkeleton } from "@/components/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

type PermissionChecker = (menuCode?: string | null, permCode?: string) => boolean;
interface CenterStat {
  key: string;
  label: string;
  objectCount: number;
  pendingCount: number;
  riskCount: number;
  healthScore: number;
  members: Array<{
    type: string;
    total: number;
    active: number;
    pending: number;
    frozen: number;
    archived: number;
  }>;
}

const TYPE_TO_MENU: Record<string, string> = {
  organization: 'MENU_MD_ORG',
  company: 'MENU_MD_COMPANY',
  project: 'MENU_MD_PROJECT',
  customer: 'MENU_MD_CUSTOMER',
  supplier: 'MENU_MD_SUPPLIER',
  store: 'MENU_MD_STORE',
  product: 'MENU_MD_PRODUCT',
  grade: 'MENU_MD_GRADE',
  spec: 'MENU_MD_PACKAGING',
  sku: 'MENU_MD_SKU',
  warehouse: 'MENU_MD_WAREHOUSE',
  driver: 'MENU_MD_DRIVER',
  vehicle: 'MENU_MD_VEHICLE',
  'cash-account': 'MENU_MD_CASH_ACCOUNT',
  'bank-account': 'MENU_MD_BANK_ACCOUNT',
  dict: 'MENU_SETTINGS_DATA',
};

const PENDING_ENTRY_MENUS = Object.values(TYPE_TO_MENU);

function canAccessMenu(hasPermission: PermissionChecker, menu?: string) {
  return Boolean(menu) && hasPermission(menu, 'V');
}

function canAccessAny(hasPermission: PermissionChecker, menus: string[]) {
  return menus.some(menu => hasPermission(menu, 'V'));
}

const CENTER_META: Record<string, {
  title: string;
  subtitle: string;
  accent: string;
  icon: any;
  members: Array<{
    type: string;
    label: string;
    icon: any;
    href: string;
  }>;
}> = {
  org: {
    title: '组织中心',
    subtitle: '集团 / 公司 / 项目 / 用户授权',
    accent: 'var(--color-accent)',
    icon: Network,
    members: [{
      type: 'organization',
      label: '组织架构',
      icon: Network,
      href: '/master-data/organizations'
    }, {
      type: 'company',
      label: '公司档案',
      icon: Building,
      href: '/master-data/companies'
    }, {
      type: 'project',
      label: '项目档案',
      icon: FolderKanban,
      href: '/master-data/projects'
    }]
  },
  biz: {
    title: '商业主体中心',
    subtitle: '客户 / 供应商 / 门店',
    accent: 'var(--status-info)',
    icon: Users,
    members: [{
      type: 'customer',
      label: '客户档案',
      icon: Users,
      href: '/master-data/customers'
    }, {
      type: 'supplier',
      label: '供应商档案',
      icon: Globe,
      href: '/master-data/suppliers'
    }, {
      type: 'store',
      label: '门店档案',
      icon: Store,
      href: '/master-data/stores'
    }]
  },
  product: {
    title: '产品中心',
    subtitle: '产品 / 等级 / 规格 / SKU',
    accent: 'var(--status-warning)',
    icon: Layers,
    members: [{
      type: 'product',
      label: '产品档案',
      icon: Egg,
      href: '/master-data/products'
    }, {
      type: 'grade',
      label: '产品等级',
      icon: Tag,
      href: '/master-data/product-grades'
    }, {
      type: 'spec',
      label: '包装规格',
      icon: Package,
      href: '/master-data/packaging-specs'
    }, {
      type: 'sku',
      label: 'SKU 档案',
      icon: Layers,
      href: '/master-data/product-skus'
    }]
  },
  wms: {
    title: '仓储 & 物流中心',
    subtitle: '仓库 / 司机 / 车辆',
    accent: 'var(--color-purple-500)',
    icon: Warehouse,
    members: [{
      type: 'warehouse',
      label: '仓库档案',
      icon: Warehouse,
      href: '/master-data/warehouses'
    }, {
      type: 'driver',
      label: '司机档案',
      icon: UserCheck,
      href: '/master-data/drivers'
    }, {
      type: 'vehicle',
      label: '车辆档案',
      icon: Car,
      href: '/master-data/vehicles'
    }]
  },
  fin: {
    title: '财务主数据中心',
    subtitle: '资金账户 / 银行账户',
    accent: 'var(--status-info)',
    icon: Wallet,
    members: [{
      type: 'cash-account',
      label: '资金账户档案',
      icon: Wallet,
      href: '/master-data/cash-accounts'
    }, {
      type: 'bank-account',
      label: '银行账户中心',
      icon: Banknote,
      href: '/master-data/bank-accounts'
    }]
  },
  gov: {
    title: '治理中心',
    subtitle: '字典 / 审批 / 治理驾驶舱 / 数据质量',
    accent: 'var(--status-success)',
    icon: ShieldCheck,
    members: [{
      type: 'dict',
      label: '数据字典中心',
      icon: BookOpen,
      href: '/master-data/dictionaries'
    }]
  }
};
function healthColor(s: number) {
  if (s >= 90) return 'var(--status-success)';
  if (s >= 75) return 'var(--color-accent)';
  if (s >= 60) return 'var(--status-warning)';
  return 'var(--status-danger)';
}
export default function MasterDataHubPage() {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const [centers, setCenters] = useState<CenterStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canViewCenter = hasPermission('MENU_MD_CENTER', 'V');
  const canViewGovernance = hasPermission('MENU_MD_QUALITY', 'V');
  const canViewDataQuality = hasPermission('MENU_MD_QUALITY', 'V');
  const canViewPending = canAccessAny(hasPermission, PENDING_ENTRY_MENUS);
  const load = useCallback(async () => {
    if (!canViewCenter) {
      setCenters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setCenters(await request<CenterStat[]>('/master-data/operations/centers'));
    } catch (e: any) {
      setError(e?.message || t('md.loadFailed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [canViewCenter]);
  useEffect(() => {
    void load();
  }, [load]);
  const navTiles = [{
    key: 'operations',
    href: '/master-data/operations',
    label: t('md.opsWorkbench', '运营工作台'),
    desc: t('md.opsWorkbenchDesc', '待审批 / 补资料 / 风险处理'),
    icon: Briefcase,
    accent: 'var(--status-info)',
    visible: canViewCenter,
  }, {
    key: 'governance',
    href: '/master-data/governance',
    label: t('md.governanceCockpit', '治理驾驶舱'),
    desc: t('md.governanceCockpitDesc', '6 维度评分 / 字典覆盖率 / 趋势'),
    icon: Activity,
    accent: 'var(--color-purple-600)',
    visible: canViewGovernance,
  }, {
    key: 'pending',
    href: '/master-data/pending',
    label: t('md.mdPending', '主数据待审批'),
    desc: t('md.mdPendingDesc', 'Workflow 审批入口'),
    icon: CheckSquare,
    accent: 'var(--status-warning)',
    visible: canViewPending,
  }, {
    key: 'data-quality',
    href: '/data-quality',
    label: t('md.g5DataQuality', 'G5 数据质量中心'),
    desc: t('md.g5DataQualityDesc', '7 维度全局健康评分'),
    icon: ShieldCheck,
    accent: 'var(--status-success)',
    visible: canViewDataQuality,
  }].filter(tile => tile.visible);
  return <div>
      {/* 顶部页头 + 全局搜索 */}
      <div className={u.mb20}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8
      }}>
          <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'var(--color-primary)1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
            <LayoutDashboard size={20} style={{
            color: 'var(--color-primary)'
          }} />
          </div>
          <div className={u.flex1}>
            <h1 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700
          }}>{t('md.hubTitle', '主数据运营平台')}</h1>
            <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginTop: 2
          }}>
              {t('md.hubSubtitle', 'Phoenix ERP 唯一可信主数据入口 · 6 大中心 · 19 个对象')}
            </div>
          </div>
          <button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
            <RefreshCw size={13} style={{
            animation: loading ? 'spin 1s linear infinite' : 'none'
          }} /> {t('md.refresh', '刷新')}
          </button>
        </div>
        {canViewCenter && <MasterDataSearch />}
      </div>

      {/* 运营入口 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 12,
      marginBottom: 24
    }}>
        {navTiles.map(tile => {
          const TileIcon = tile.icon;
          return (
            <a key={tile.key} href={tile.href} style={navTileStyle(tile.accent)}>
              <TileIcon size={18} style={{ color: tile.accent }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{tile.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{tile.desc}</div>
              </div>
            </a>
          );
        })}
      </div>

      {error && <div style={{
      padding: 10,
      background: 'var(--status-danger-bg-faint)',
      color: 'var(--status-danger)',
      borderRadius: 8,
      marginBottom: 14
    }}>{error}</div>}

      {/* 6 中心运营卡 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
      gap: 14
    }}>
        {centers.map(c => {
        const meta = CENTER_META[c.key];
        if (!meta) return null;
        const Icon = meta.icon;
        return <div key={c.key} style={{
          padding: 18,
          borderRadius: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderTop: `3px solid ${meta.accent}`
        }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14
          }}>
                <div style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: `${meta.accent}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
                  <Icon size={17} style={{
                color: meta.accent
              }} />
                </div>
                <div className={u.flex1}>
                  <div style={{
                fontSize: 15,
                fontWeight: 700
              }}>{t('md.centerTitle.' + c.key, meta.title)}</div>
                  <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginTop: 1
              }}>{t('md.centerSubtitle.' + c.key, meta.subtitle)}</div>
                </div>
                <div className={u.tar}>
                  <div style={{
                fontSize: 18,
                fontWeight: 800,
                color: healthColor(c.healthScore),
                lineHeight: 1
              }}>{c.healthScore}</div>
                  <div style={{
                fontSize: 10,
                color: 'var(--text-secondary)'
              }}>{t('md.healthScore', '健康度')}</div>
                </div>
              </div>

              <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 14
          }}>
                <Stat label={t('md.objectTotal', '对象总数')} value={c.objectCount} accent={meta.accent} />
                <Stat label={t('md.pending', '待审批')} value={c.pendingCount} accent={c.pendingCount > 0 ? 'var(--status-warning)' : 'var(--text-secondary)'} />
                <Stat label={t('md.risk', '风险')} value={c.riskCount} accent={c.riskCount > 0 ? 'var(--status-danger)' : 'var(--text-secondary)'} />
              </div>

              <div style={{
            display: 'grid',
            gridTemplateColumns: meta.members.length > 2 ? 'repeat(2, 1fr)' : '1fr',
            gap: 6
          }}>
                {meta.members.filter(m => canAccessMenu(hasPermission, TYPE_TO_MENU[m.type])).map(m => {
              const memberStat = c.members.find(x => x.type === m.type);
              const MemberIcon = m.icon;
              return <a key={m.type} href={m.href} style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5
              }}>
                      <MemberIcon size={13} style={{
                  color: meta.accent,
                  flexShrink: 0
                }} />
                      <span style={{
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{t('md.member.' + m.type, m.label)}</span>
                      {memberStat && <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)'
                }}>
                          {memberStat.active}/{memberStat.total}
                        </span>}
                    </a>;
            })}
              </div>
            </div>;
      })}
      </div>

      {loading && centers.length === 0 && <LoadingSkeleton variant="card" rows={6} />}
    </div>;
}
function Stat({
  label,
  value,
  accent
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return <div>
      <div style={{
      fontSize: 11,
      color: 'var(--text-secondary)',
      marginBottom: 2
    }}>{label}</div>
      <div style={{
      fontSize: 18,
      fontWeight: 800,
      color: accent,
      lineHeight: 1
    }}>{value}</div>
    </div>;
}
function navTileStyle(accent: string): React.CSSProperties {
  return {
    padding: '14px 16px',
    borderRadius: 10,
    background: 'var(--bg-card)',
    border: `1px solid var(--border)`,
    borderLeft: `3px solid ${accent}`,
    textDecoration: 'none',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 12
  };
}
