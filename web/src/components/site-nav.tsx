"use client";

import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui";

const NAV_LINKS = [
  { href: "/#about", label: "概要" },
  { href: "/#flow", label: "ご利用の流れ" },
  { href: "/#plans", label: "料金" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader({
  user,
}: {
  user: { displayName: string | null; email: string; role: string } | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-white/85 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(255,61,46,0.08)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />

        <nav
          aria-label="サイトメニュー"
          className="hidden items-center gap-5 text-sm font-bold text-ink-700 lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link hover:text-brand-600">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className="hidden px-2 text-sm font-bold text-ink-700 hover:text-brand-600 lg:inline"
                >
                  管理
                </Link>
              ) : null}
              <Link
                href="/mypage"
                className="hidden px-2 text-sm font-bold text-ink-700 hover:text-brand-600 sm:inline"
              >
                マイページ
              </Link>
              <LinkButton href="/diagnosis/new" className="!min-h-10 !px-3 !text-sm sm:!px-4">
                <span className="sm:hidden">診断する</span>
                <span className="hidden sm:inline">物件を診断する</span>
              </LinkButton>
            </>
          ) : (
            <>
              <LinkButton
                href="/login"
                variant="accent"
                className="hidden !min-h-10 !px-3 !text-sm lg:inline-flex sm:!px-4"
              >
                ログイン
              </LinkButton>
              <LinkButton href="/diagnosis/new" className="!min-h-10 !px-3 !text-sm sm:!px-4">
                <span className="sm:hidden">無料で確認</span>
                <span className="hidden sm:inline">無料で相場を確認</span>
              </LinkButton>
            </>
          )}

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line)] text-ink-900 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((current) => !current)}
          >
            <span className="sr-only">メニュー</span>
            <span aria-hidden className="flex flex-col gap-1.5">
              <span className="block h-0.5 w-4 bg-ink-900" />
              <span className="block h-0.5 w-4 bg-ink-900" />
              <span className="block h-0.5 w-4 bg-ink-900" />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="モバイルメニュー"
          className="mobile-nav-panel border-t border-[var(--color-line)] bg-white px-4 py-3 lg:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg px-3 py-3 text-sm font-bold text-ink-700 hover:bg-brand-50"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {user ? (
              <li>
                <Link
                  href="/mypage"
                  className="block rounded-lg px-3 py-3 text-sm font-bold text-ink-700 hover:bg-brand-50"
                  onClick={() => setOpen(false)}
                >
                  マイページ
                </Link>
              </li>
            ) : (
              <li>
                <Link
                  href="/login"
                  className="block rounded-lg px-3 py-3 text-sm font-bold text-ink-700 hover:bg-brand-50"
                  onClick={() => setOpen(false)}
                >
                  ログイン
                </Link>
              </li>
            )}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
