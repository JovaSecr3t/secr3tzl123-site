import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "secr3tzl123.top",
  description: "个人博客 · 日常分享 · 登录系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}