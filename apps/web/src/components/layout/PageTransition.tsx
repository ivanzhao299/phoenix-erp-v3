"use client";

import { usePathname } from "next/navigation";
import styles from "./PageTransition.module.css";

/**
 * 路由切换轻量过渡包裹。
 *
 * 机制：用 pathname 作 key 包住 children——导航到新路由时 key 变 → 该 div 重挂载 →
 * CSS 入场动画（淡入 + 8px 上移，240ms）重放；同一路由内的 setState 重渲染 key 不变，
 * 不会重放动画、不影响页面自身状态。无第三方依赖，尊重 prefers-reduced-motion。
 *
 * 注意：children 本身在路由变化时由 App Router 切换成新页面组件，key 只控制动画重放，
 * 不会额外造成页面状态丢失（页面组件本就随路由更替）。
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={styles.fade}>
      {children}
    </div>
  );
}
