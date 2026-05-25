'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, Bell, CheckCheck, Sun, Moon } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { notificationApi, type MobileNotification } from '@/lib/mobile-api';

// ── 通知类型配置 ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  TASK_CREATED:    { icon: '📋', color: '#7c3aed', label: '新审批任务' },
  TASK_APPROVED:   { icon: '✅', color: '#10b981', label: '审批通过' },
  TASK_REJECTED:   { icon: '❌', color: '#ef4444', label: '审批拒绝' },
  TASK_COMPLETED:  { icon: '🎉', color: '#10b981', label: '流程完成' },
  TASK_CANCELLED:  { icon: '🚫', color: '#94a3b8', label: '流程取消' },
  REMINDER:        { icon: '⏰', color: '#f59e0b', label: '催办提醒' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { icon: '🔔', color: '#6b7280', label: type };
}

// ── 通知卡片 ──────────────────────────────────────────────────────────────────

function NotificationCard({
  item,
  onRead,
  onTap,
}: {
  item: MobileNotification;
  onRead: (id: string) => void;
  onTap: (item: MobileNotification) => void;
}) {
  const { t } = useMobileTheme();
  const cfg = getTypeConfig(item.notificationType);
  const isUnread = item.status === 'UNREAD';

  return (
    <div
      style={{
        background: t.cardBg,
        borderRadius: 14,
        padding: '14px 16px',
        border: `1px solid ${isUnread ? cfg.color + '44' : t.cardBorder}`,
        marginBottom: 10,
        cursor: 'pointer',
        position: 'relative',
        opacity: isUnread ? 1 : 0.75,
      }}
      onClick={() => {
        if (isUnread) onRead(item.id);
        onTap(item);
      }}
    >
      {/* 未读红点 */}
      {isUnread && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          width: 8, height: 8, borderRadius: '50%',
          background: cfg.color,
        }} />
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 图标 */}
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: `${cfg.color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          {cfg.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingRight: isUnread ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: cfg.color,
              padding: '1px 6px', borderRadius: 10,
              background: `${cfg.color}15`,
            }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: 11, color: t.textFaint }}>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—'}
            </span>
          </div>

          <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: 14, color: t.text, lineHeight: 1.4, marginBottom: 4 }}>
            {item.title}
          </div>

          {item.body && (
            <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
              {item.body}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const toast = useToast();

  const [items,   setItems]   = useState<MobileNotification[]>([]);
  const [unread,  setUnread]  = useState(0);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [filter,  setFilter]  = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [listRes, countRes] = await Promise.all([
        notificationApi.list({ page: 1, pageSize: 50, status: filter === 'unread' ? 'UNREAD' : undefined }),
        notificationApi.unreadCount(),
      ]);
      setItems(listRes.items);
      setUnread(countRes);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleRead = async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setItems(prev => prev.map(n => n.id === id ? { ...n, status: 'READ' } : n));
      setUnread(v => Math.max(0, v - 1));
    } catch { /* silent */ }
  };

  const handleReadAll = async () => {
    try {
      await notificationApi.readAll();
      haptic('success');
      toast.success('全部已读');
      setItems(prev => prev.map(n => ({ ...n, status: 'READ' })));
      setUnread(0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleTap = (item: MobileNotification) => {
    if (item.refType === 'APPROVAL_INSTANCE' && item.refId) {
      router.push('/mobile/workflow');
    }
  };

  return (
    <div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: t.appBarBg, borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/mobile/home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ChevronLeft size={20} />
          <span style={{ fontSize: 14 }}>返回</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={18} color="#f59e0b" />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>通知中心</span>
          {unread > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff', borderRadius: 12,
              padding: '1px 7px', fontSize: 11, fontWeight: 700,
            }}>{unread}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {unread > 0 && (
            <button
              onClick={handleReadAll}
              title="全部已读"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: 6 }}
            >
              <CheckCheck size={18} />
            </button>
          )}
          <button onClick={() => { haptic('light'); load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 6 }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 6 }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 过滤 Tab */}
      <div style={{ display: 'flex', margin: '12px 16px 0', background: t.inputBg, borderRadius: 12, padding: 4 }}>
        {([['all', '全部'], ['unread', `未读${unread > 0 ? ` (${unread})` : ''}`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              background: filter === key ? '#f59e0b' : 'transparent',
              color: filter === key ? '#fff' : t.textSub,
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, padding: '12px 16px calc(24px + env(safe-area-inset-bottom))' }}>
        {loading && [1, 2, 3, 4].map(i => <SkeletonCard key={i} lines={2} />)}
        {!loading && err && (
          <div style={{ color: '#ef4444', background: '#fef2f2', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
            {err}
          </div>
        )}
        {!loading && !err && items.length === 0 && (
          <MobileEmptyState
            icon="🔕"
            title={filter === 'unread' ? '暂无未读通知' : '暂无通知'}
            desc="审批任务更新时会在这里通知您"
          />
        )}
        {!loading && !err && items.map(item => (
          <NotificationCard
            key={item.id}
            item={item}
            onRead={handleRead}
            onTap={handleTap}
          />
        ))}
      </div>
    </div>
  );
}
