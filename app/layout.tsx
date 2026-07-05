import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web 自动化测试 Agent",
  description: "基于 Playwright MCP 的 Web 自动化测试系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
