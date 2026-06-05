import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/providers/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "金凤凰 ERP — Phoenix ERP V3",
  description: "Phoenix ERP V3 — 鸡蛋供应链管理系统",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-256.png", type: "image/png", sizes: "256x256" },
    ],
    apple: { url: "/icon-256.png", sizes: "256x256", type: "image/png" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,        // 禁止用户捏合缩放（会触发页面位移）
  userScalable: false,
  viewportFit: "cover",  // 支持刘海/安全区 env(safe-area-inset-*)
  themeColor: "var(--status-warning)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning className={inter.className}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
