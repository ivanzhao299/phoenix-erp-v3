import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="phx-error-shell">
      <section className="phx-error-card">
        <p className="phx-error-kicker">404</p>
        <h1 className="phx-error-title">页面不存在或暂无权限访问</h1>
        <p className="phx-error-desc">
          请从左侧菜单重新进入业务页面；如果你应当拥有该功能，请联系管理员核对角色权限。
        </p>
        <div className="phx-error-actions">
          <Link className="phx-btn" href="/home">
            返回首页
          </Link>
        </div>
      </section>
    </div>
  );
}
