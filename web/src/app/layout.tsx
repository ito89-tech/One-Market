import type { Metadata, Viewport } from "next";

import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ワンマケ｜ワンルーム投資物件の価格が相場と比べてどうかを確認",
    template: "%s｜ワンマケ",
  },
  description:
    "提案されたワンルーム投資物件の価格が、エリアと築年数から見た相場と比べてどうなのかを確認できるサービスです。",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e7c86",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white"
        >
          本文へスキップ
        </a>
        <SiteHeader
          user={
            user
              ? {
                  displayName: user.displayName,
                  email: user.email,
                  role: user.role,
                }
              : null
          }
        />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
