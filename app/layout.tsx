import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "行测轨迹｜成绩分析看板",
  description: "记录行测仿真模拟与模块练习，跨设备同步复盘。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
