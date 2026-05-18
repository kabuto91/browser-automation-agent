import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Automation Agent",
  description: "Plan-and-Execute browser automation testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
