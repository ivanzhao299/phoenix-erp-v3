'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, Bell, CheckCheck, Sun, Moon, BellRing, BellOff } from 'lucide-react';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { SkeletonCard, MobileEmptyState } from '@/components/mobile/MobileSkeleton';
import { useToast } from '@/contexts/ToastContext';
import { haptic } from '@/lib/haptic';
import { notificationApi, type MobileNotification } from '@/lib/mobile-api';
import { resolveNotificationHref } from '@/lib/notification-routing';
import { authHeader } from '@/lib/mobile-auth-token';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

// ── Web Push 工具 ─────────────────────────────────────────────────────────────

type PushStatus = 'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'idle';
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArr = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) outputArr[i] = rawData.charCodeAt(i);
  return outputArr;
}

// ── 通知类型配置 ──────────────────────────────────────────────────────────────

type TFn = (key: string, fallback: string) => string;
const buildTypeConfig = (tr: TFn): Record<string, {
  icon: string;
  color: string;
  label: string;
}> => ({
  TASK_CREATED: {
    icon: '📋',
    color: 'var(--color-purple-600)',
    label: tr('mob.sys.notif_task_created', '新审批任务')
  },
  TASK_APPROVED: {
    icon: '✅',
    color: 'var(--status-success)',
    label: tr('mob.sys.notif_task_approved', '审批通过')
  },
  TASK_REJECTED: {
    icon: '❌',
    color: 'var(--status-danger)',
    label: tr('mob.sys.notif_task_rejected', '审批拒绝')
  },
  TASK_COMPLETED: {
    icon: '🎉',
    color: 'var(--status-success)',
    label: tr('mob.sys.notif_task_completed', '流程完成')
  },
  TASK_CANCELLED: {
    icon: '🚫',
    color: 'var(--slate-400)',
    label: tr('mob.sys.notif_task_cancelled', '流程取消')
  },
  REMINDER: {
    icon: '⏰',
    color: 'var(--status-warning)',
    label: tr('mob.sys.notif_reminder', '催办提醒')
  },
  // Phase F: SLA 类型
  TASK_REMINDER: {
    icon: '⏰',
    color: 'var(--status-warning)',
    label: tr('mob.sys.notif_task_reminder', '审批催办')
  },
  TASK_OVERDUE: {
    icon: '🔴',
    color: 'var(--status-danger)',
    label: tr('mob.sys.notif_task_overdue', '审批超期')
  },
  TASK_ESCALATED: {
    icon: '🔺',
    color: 'var(--status-warning)',
    label: tr('mob.sys.notif_task_escalated', '审批升级')
  }
});
function getTypeConfig(type: string, tr: TFn) {
  return buildTypeConfig(tr)[type] ?? {
    icon: '🔔',
    color: 'var(--gray-500)',
    label: type
  };
}

// ── 通知卡片 ──────────────────────────────────────────────────────────────────

function NotificationCard({
  item,
  onRead,
  onTap
}: {
  item: MobileNotification;
  onRead: (id: string) => void;
  onTap: (item: MobileNotification) => void;
}) {
  const {
    t
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const cfg = getTypeConfig(item.notificationType, tr);
  const isUnread = item.status === 'UNREAD';
  return <div style={{
    background: t.cardBg,
    borderRadius: 14,
    padding: '14px 16px',
    border: `1px solid ${isUnread ? cfg.color + '44' : t.cardBorder}`,
    marginBottom: 10,
    cursor: 'pointer',
    position: 'relative',
    opacity: isUnread ? 1 : 0.75
  }} onClick={() => {
    if (isUnread) onRead(item.id);
    onTap(item);
  }}>
      {/* 未读红点 */}
      {isUnread && <div style={{
      position: 'absolute',
      top: 14,
      right: 14,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: cfg.color
    }} />}

      <div style={{
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start'
    }}>
        {/* 图标 */}
        <div style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        flexShrink: 0,
        background: `${cfg.color}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20
      }}>
          {cfg.icon}
        </div>

        <div style={{
        flex: 1,
        minWidth: 0,
        paddingRight: isUnread ? 16 : 0
      }}>
          <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4
        }}>
            <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: cfg.color,
            padding: '1px 6px',
            borderRadius: 10,
            background: `${cfg.color}15`
          }}>
              {cfg.label}
            </span>
            <span style={{
            fontSize: 11,
            color: t.textFaint
          }}>
              {item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : '—'}
            </span>
          </div>

          <div style={{
          fontWeight: isUnread ? 700 : 500,
          fontSize: 14,
          color: t.text,
          lineHeight: 1.4,
          marginBottom: 4
        }}>
            {item.title}
          </div>

          {item.body && <div style={{
          fontSize: 12,
          color: t.textSub,
          lineHeight: 1.5
        }}>
              {item.body}
            </div>}
        </div>
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const {
    isDark,
    toggle,
    t
  } = useMobileTheme();
  const {
    t: tr
  } = useLanguage();
  const toast = useToast();
  const { allowed, loading: permLoading } = useMobilePermission('notifications');  // F10 加固：页面级门禁
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // ── Push 订阅状态 ────────────────────────────────────────────────────────
  const [pushStatus, setPushStatus] = useState<PushStatus>('unknown');
  const [pushWorking, setPushWorking] = useState(false);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
    if (!supported) {
      setPushStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }
    navigator.serviceWorker.ready.then(reg => {
      swRegRef.current = reg;
      return reg.pushManager.getSubscription();
    }).then(sub => {
      setPushStatus(sub ? 'subscribed' : 'idle');
    }).catch(() => setPushStatus('idle'));
  }, []);
  const handlePushSubscribe = async () => {
    if (pushWorking) return;
    setPushWorking(true);
    try {
      const pkRes = await fetch('/api/notifications/push/public-key');
      const pkJson = await pkRes.json().catch(() => ({}));
      if (!pkJson.enabled) {
        toast.error(tr('mob.sys.push_not_enabled', '推送功能暂未在服务器启用'));
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushStatus('denied');
        toast.error(tr('mob.sys.push_perm_denied', '推送权限被拒绝'));
        return;
      }
      const reg = swRegRef.current ?? (await navigator.serviceWorker.ready);
      swRegRef.current = reg;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pkJson.publicKey)
      });
      const subJson = sub.toJSON() as {
        endpoint: string;
        keys: {
          p256dh: string;
          auth: string;
        };
      };
      await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
          platform: navigator.platform
        })
      });
      setPushStatus('subscribed');
      haptic('success');
      toast.success(tr('mob.sys.push_on', '推送通知已开启'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('mob.sys.subscribe_failed', '订阅失败，请重试'));
    } finally {
      setPushWorking(false);
    }
  };
  const handlePushUnsubscribe = async () => {
    if (pushWorking || !swRegRef.current) return;
    setPushWorking(true);
    try {
      const sub = await swRegRef.current.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/notifications/push/unsubscribe', {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({
            endpoint: sub.endpoint
          })
        });
        await sub.unsubscribe();
      }
      setPushStatus('idle');
      haptic('light');
      toast.success(tr('mob.sys.push_off', '推送通知已关闭'));
    } catch {
      toast.error(tr('mob.sys.op_failed_retry', '操作失败，请重试'));
    } finally {
      setPushWorking(false);
    }
  };
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [listRes, countRes] = await Promise.all([notificationApi.list({
        page: 1,
        pageSize: 50,
        status: filter === 'unread' ? 'UNREAD' : undefined
      }), notificationApi.unreadCount()]);
      setItems(listRes.items);
      setUnread(countRes);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : tr('mob.sys.load_failed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [filter, tr]);
  useEffect(() => {
    load();
  }, [load]);
  const handleRead = async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setItems(prev => prev.map(n => n.id === id ? {
        ...n,
        status: 'READ'
      } : n));
      setUnread(v => Math.max(0, v - 1));
    } catch {/* silent */}
  };
  const handleReadAll = async () => {
    try {
      await notificationApi.readAll();
      haptic('success');
      toast.success(tr('mob.sys.all_read', '全部已读'));
      setItems(prev => prev.map(n => ({
        ...n,
        status: 'READ'
      })));
      setUnread(0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tr('mob.sys.op_failed', '操作失败'));
    }
  };
  const handleTap = (item: MobileNotification) => {
    router.push(resolveNotificationHref({
      notificationType: item.notificationType,
      content: item.body,
      linkType: item.linkType ?? item.refType ?? null,
      linkId: item.linkId ?? item.refId ?? null,
    }, { mobile: true }));
  };
  if (permLoading || !allowed) return null;  // F10：无权限不渲染（后端 @RequireMenu 兜底）
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* AppBar */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
      background: t.appBarBg,
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
        <button onClick={() => router.push('/mobile/home')} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: t.textSub,
        display: 'flex',
        alignItems: 'center',
        gap: 4
      }}>
          <ChevronLeft size={20} />
          <span className={u.fs14}>{tr('mob.sys.back', '返回')}</span>
        </button>

        <div className={u.flexRow8}>
          <Bell size={18} color="var(--status-warning)" />
          <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: t.text
        }}>{tr('mob.sys.notif_center', '通知中心')}</span>
          {unread > 0 && <span style={{
          background: 'var(--status-danger)',
          color: 'var(--bg-card)',
          borderRadius: 12,
          padding: '1px 7px',
          fontSize: 11,
          fontWeight: 700
        }}>{unread}</span>}
        </div>

        <div style={{
        display: 'flex',
        gap: 4
      }}>
          {unread > 0 && <button onClick={handleReadAll} title={tr('mob.sys.all_read', '全部已读')} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--status-success)',
          padding: 6
        }}>
              <CheckCheck size={18} />
            </button>}
          <button onClick={() => {
          haptic('light');
          load();
        }} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub,
          padding: 6
        }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={toggle} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textSub,
          padding: 6
        }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* 过滤 Tab */}
      <div style={{
      display: 'flex',
      margin: '12px 16px 0',
      background: t.inputBg,
      borderRadius: 12,
      padding: 4
    }}>
        {([['all', tr('mob.sys.all', '全部')], ['unread', `${tr('mob.sys.unread', '未读')}${unread > 0 ? ` (${unread})` : ''}`]] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} style={{
        flex: 1,
        padding: '9px 0',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        background: filter === key ? 'var(--status-warning)' : 'transparent',
        color: filter === key ? 'var(--bg-card)' : t.textSub,
        transition: 'all 0.2s'
      }}>
            {label}
          </button>)}
      </div>

      {/* Push 订阅卡片 */}
      {pushStatus !== 'unknown' && <div style={{
      margin: '10px 16px 0',
      background: t.cardBg,
      borderRadius: 12,
      padding: '12px 14px',
      border: `1px solid ${t.cardBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    }}>
          <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0
      }}>
            {pushStatus === 'subscribed' ? <BellRing size={18} color="var(--status-success)" /> : pushStatus === 'unsupported' || pushStatus === 'denied' ? <BellOff size={18} color="var(--slate-400)" /> : <Bell size={18} color="var(--status-warning)" />}
            <span style={{
          fontSize: 13,
          color: t.text
        }}>
              {pushStatus === 'subscribed' && tr('mob.sys.push_on', '推送通知已开启')}
              {pushStatus === 'unsupported' && tr('mob.sys.push_unsupported', '当前浏览器不支持推送通知')}
              {pushStatus === 'denied' && tr('mob.sys.push_denied_hint', '推送权限已被拒绝（请在浏览器设置中允许）')}
              {pushStatus === 'idle' && tr('mob.sys.push_idle_hint', '开启推送，审批变化第一时间收到通知')}
            </span>
          </div>
          {(pushStatus === 'idle' || pushStatus === 'subscribed') && <button onClick={pushStatus === 'subscribed' ? handlePushUnsubscribe : handlePushSubscribe} disabled={pushWorking} style={{
        flexShrink: 0,
        padding: '7px 14px',
        borderRadius: 8,
        border: 'none',
        cursor: pushWorking ? 'not-allowed' : 'pointer',
        background: pushStatus === 'subscribed' ? isDark ? 'var(--slate-800)' : 'var(--slate-100)' : 'var(--status-success)',
        color: pushStatus === 'subscribed' ? t.textSub : 'var(--bg-card)',
        fontSize: 13,
        fontWeight: 600,
        opacity: pushWorking ? 0.6 : 1
      }}>
              {pushWorking ? tr('mob.sys.processing', '处理中…') : pushStatus === 'subscribed' ? tr('mob.sys.close', '关闭') : tr('mob.sys.enable_push', '开启推送')}
            </button>}
        </div>}

      {/* 内容 */}
      <div style={{
      flex: 1,
      padding: '12px 16px calc(24px + env(safe-area-inset-bottom))'
    }}>
        {loading && [1, 2, 3, 4].map(i => <SkeletonCard key={i} lines={2} />)}
        {!loading && err && <div style={{
        color: 'var(--status-danger)',
        background: 'var(--status-danger-bg-faint)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13
      }}>
            {err}
          </div>}
        {!loading && !err && items.length === 0 && <MobileEmptyState icon="🔕" title={filter === 'unread' ? tr('mob.sys.no_unread_notif', '暂无未读通知') : tr('mob.sys.no_notif', '暂无通知')} desc={tr('mob.sys.notif_empty_desc', '审批任务更新时会在这里通知您')} />}
        {!loading && !err && items.map(item => <NotificationCard key={item.id} item={item} onRead={handleRead} onTap={handleTap} />)}
      </div>
    </div>;
}
