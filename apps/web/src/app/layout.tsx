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
  description: "Phoenix ERP V3 — 鸡蛋供应链管理系统（老挝凤羽农业）",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f59e0b",
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
