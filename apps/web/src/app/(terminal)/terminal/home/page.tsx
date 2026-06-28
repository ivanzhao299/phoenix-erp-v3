'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { T } from '@/styles/terminal-theme';
import { Package2, Warehouse, Truck, type LucideIcon } from 'lucide-react';

interface DomainTile {
  id: string;
  perm: string;
  path: string;
  icon: LucideIcon;
  titleKey: string;
  titleFb: string;
  descKey: string;
  descFb: string;
  ready: boolean;
}

const TILES: DomainTile[] = [
  { id: 'packaging', perm: 'MENU_PKG_OP',     path: '/terminal/packaging/dashboard', icon: Package2,  titleKey: 'terminal.title',          titleFb: '包装作业', descKey: 'terminal.home_pkg_desc', descFb: '集蛋 · 分级 · 包装 · 入库', ready: true },
  { id: 'wms',       perm: 'MENU_WMS_INOUT',  path: '/terminal/wms/inbound',         icon: Warehouse, titleKey: 'terminal.wms_title',      titleFb: '仓储作业', descKey: 'terminal.home_wms_desc', descFb: '入库 · 出库 · 盘点',         ready: true },
  { id: 'delivery',  perm: 'MENU_MOBILE_DELIVERY', path: '/terminal/delivery',       icon: Truck,     titleKey: 'terminal.delivery_title', titleFb: '配送作业', descKey: 'terminal.home_dlv_desc', descFb: '装车 · 发车 · 签收',         ready: false },
];

export default function TerminalHomePage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const { t } = useLanguage();

  const visible = TILES.filter(tile =>
    hasPermission('*') || hasPermission(tile.perm),
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>
      <div style={{ padding: '32px 40px 8px', flexShrink: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: T.TXT }}>
          {t('terminal.home_welcome', '选择作业台')}
        </div>
        <div style={{ fontSize: 14, color: T.MUT, marginTop: 6 }}>
          {user?.name || user?.username} · {t('terminal.home_hint', '点击进入对应手持终端作业')}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 40px 40px' }}>
        {visible.length === 0 ? (
          <div style={{ color: T.MUT, fontSize: 15, padding: 40, textAlign: 'center' }}>
            {t('terminal.home_no_access', '当前账号未分配任何终端作业权限，请联系管理员。')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, maxWidth: 1000 }}>
            {visible.map(tile => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={!tile.ready}
                  onClick={() => tile.ready && router.push(tile.path)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14,
                    padding: '26px 24px', borderRadius: 18,
                    background: tile.ready ? T.CARD : 'var(--overlay-white-03)',
                    border: `1.5px solid ${T.BOR}`,
                    cursor: tile.ready ? 'pointer' : 'not-allowed',
                    opacity: tile.ready ? 1 : 0.55,
                    textAlign: 'left', minHeight: 150,
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: tile.ready ? `${T.ACC}1f` : 'var(--overlay-white-05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={30} color={tile.ready ? T.ACC : T.MUT} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: T.TXT }}>
                      {t(tile.titleKey, tile.titleFb)}
                      {!tile.ready && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: T.MUT, marginLeft: 8 }}>
                          {t('terminal.coming_soon', '即将上线')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: T.MUT, marginTop: 5 }}>{t(tile.descKey, tile.descFb)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
