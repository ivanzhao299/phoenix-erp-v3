'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  BarChart2, Package, ShieldCheck, Warehouse,
  Truck, CheckSquare, LogOut, Monitor, Wheat, Skull, Bird,
} from 'lucide-react';

type NavCard = {
  icon: React.ReactNode;
  titleZh: string;
  titleEn: string;
  titleLo: string;
  desc: string;
  href?: string;
  soon?: boolean;
  color: string;
};

const NAV_CARDS: NavCard[] = [
  {
    icon: <BarChart2 size={28} />,
    titleZh: '每日看板', titleEn: 'Daily Board', titleLo: 'ກະດານປະຈໍາວັນ',
    desc: '生产·包装·品质·销售',
    color: '#10b981', href: '/mobile/dashboard', soon: false,
  },
  {
    icon: <Wheat size={28} />,
    titleZh: '饲料台账', titleEn: 'Feed Ledger', titleLo: 'ບັນທຶກອາຫານ',
    desc: '出入库登记·库存预警',
    color: '#f59e0b', href: '/mobile/feed', soon: false,
  },
  {
    icon: <Skull size={28} />,
    titleZh: '死淘快录', titleEn: 'Mortality', titleLo: 'ບັນທຶກຕາຍ',
    desc: '各栋死淘数量快速录入',
    color: '#ef4444', href: '/mobile/mortality', soon: false,
  },
  {
    icon: <Package size={28} />,
    titleZh: '包装统计', titleEn: 'Packaging', titleLo: 'ຫຸ້ມຫໍ່',
    desc: '班次产出、等级分布',
    color: '#a78bfa', href: '/mobile/packaging', soon: false,
  },
  {
    icon: <ShieldCheck size={28} />,
    titleZh: '品质检测', titleEn: 'Quality', titleLo: 'ຄຸນນະພາບ',
    desc: '首检、过程检、出库检',
    color: '#8b5cf6', href: '/mobile/quality', soon: false,
  },
  {
    icon: <Warehouse size={28} />,
    titleZh: '鸡蛋台账', titleEn: 'Egg Ledger', titleLo: 'ບັນທຶກໄຂ່',
    desc: '出入库登记·分级库存',
    color: '#3b82f6', href: '/mobile/egg', soon: false,
  },
  {
    icon: <Truck size={28} />,
    titleZh: '销售出库', titleEn: 'Sales', titleLo: 'ການຂາຍ',
    desc: '农场直销·出库开单',
    color: '#06b6d4', href: '/mobile/sales', soon: false,
  },
  {
    icon: <CheckSquare size={28} />,
    titleZh: '药品台账', titleEn: 'Medicine', titleLo: 'ຢາ',
    desc: '药品库存·出入库登记',
    color: '#8b5cf6', href: '/mobile/medicine', soon: false,
  },
  {
    icon: <Monitor size={28} />,
    titleZh: '包装作业台', titleEn: 'Pkg Terminal', titleLo: 'Terminal',
    desc: '前往现场作业终端',
    color: '#f59e0b',
    href: '/terminal/packaging/dashboard',
    soon: false,
  },
  {
    icon: <Bird size={28} />,
    titleZh: '存栏日报', titleEn: 'Hen Report', titleLo: 'ລາຍງານໄກ່',
    desc: '母鸡存栏·产蛋率·死淘',
    color: '#22d3ee',
    href: '/mobile/henreport',
    soon: false,
  },
];

export default function MobileHomePage() {
  const { user, logout } = useAuth();
  const { lang } = useLanguage();
  const router = useRouter();

  const getTitle = (card: NavCard) =>
    lang === 'en' ? card.titleEn : lang === 'lo' ? card.titleLo : card.titleZh;

  const handleCardClick = (card: NavCard) => {
    if (card.href) router.push(card.href);
  };

  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* AppBar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 14px) 20px 14px',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 18 }}>🐦</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>金凤凰 ERP</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.2 }}>
              {user?.name || user?.username || '用户'}
            </div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <LogOut size={14} />
          退出
        </button>
      </div>

      {/* 角色 Badge */}
      <div style={{ padding: '16px 20px 8px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
            {user?.role || '管理员'}
          </span>
        </div>
      </div>

      {/* 功能卡片 Grid */}
      <div style={{
        flex: 1,
        padding: '8px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        display: 'grid',
        gridTemplateColumns: 'repeat(2,1fr)',
        gap: 12,
        alignContent: 'start',
      }}>
        {NAV_CARDS.map((card, idx) => (
          <button
            key={idx}
            onClick={() => handleCardClick(card)}
            disabled={card.soon}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '18px 16px',
              borderRadius: 16,
              background: card.soon
                ? 'rgba(255,255,255,0.03)'
                : `linear-gradient(135deg, ${card.color}18, ${card.color}08)`,
              border: `1px solid ${card.soon ? 'rgba(255,255,255,0.07)' : card.color + '35'}`,
              cursor: card.soon ? 'default' : 'pointer',
              textAlign: 'left',
              opacity: card.soon ? 0.7 : 1,
              transition: 'transform 0.1s, opacity 0.2s',
              // full-width for last odd card
              ...(idx === NAV_CARDS.length - 1 && NAV_CARDS.length % 2 !== 0
                ? { gridColumn: '1/-1' }
                : {}),
            }}
          >
            {/* 即将上线 badge */}
            {card.soon && (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.3)',
                fontWeight: 700, letterSpacing: 0.5,
              }}>
                开发中
              </div>
            )}
            <div style={{ color: card.soon ? 'rgba(255,255,255,0.3)' : card.color, marginBottom: 10 }}>
              {card.icon}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: card.soon ? 'rgba(255,255,255,0.5)' : 'white', marginBottom: 4 }}>
              {getTitle(card)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>
              {card.desc}
            </div>
          </button>
        ))}
      </div>

      {/* 底部版权 */}
      <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.1)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', paddingTop: 4 }}>
        Phoenix ERP V3 · 老挝凤羽农业
      </div>
    </div>
  );
}
