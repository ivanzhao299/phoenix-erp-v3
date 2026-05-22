'use client';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useMobileTheme } from '@/contexts/MobileThemeContext';

interface Props {
  pageKey: string;
  children: React.ReactNode;
  /** 额外传入 readonly 状态给子组件（通过 render prop 模式） */
  renderChild?: (readonly: boolean) => React.ReactNode;
}

/**
 * MobilePermissionGate — 手机端页面级权限守卫
 *
 * 无权限时展示 403 提示并自动跳回首页；
 * 只读角色时显示内容但可通过 readonly prop 禁用提交按钮。
 */
export default function MobilePermissionGate({ pageKey, children, renderChild }: Props) {
  const { allowed, readonly, loading } = useMobilePermission(pageKey);
  const { t } = useMobileTheme();

  if (loading) {
    return (
      <div style={{
        minHeight: '100svh', background: t.pageBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.textFaint, fontSize: 14,
      }}>
        加载中…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{
        minHeight: '100svh', background: t.pageBg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '0 32px',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, textAlign: 'center' }}>
          无权访问此页面
        </div>
        <div style={{ fontSize: 13, color: t.textFaint, textAlign: 'center' }}>
          您的角色暂无此模块权限，请联系管理员
        </div>
      </div>
    );
  }

  if (renderChild) return <>{renderChild(readonly)}</>;
  return <>{children}</>;
}
