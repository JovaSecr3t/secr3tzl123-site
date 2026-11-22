import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secr3tZL's base",
  description: "Secr3tZL 的个人基地 · 博客文章与日常动态分享",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}