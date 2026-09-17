import Link from "next/link";

import { Logo } from "@/components/logo";
import { SiteHeader } from "@/components/site-nav";
import { Container } from "./ui";

export { SiteHeader };

const FOOTER_COLUMNS = [
  {
    title: "サービス",
    links: [
      { href: "/diagnosis/new", label: "相場を確認する" },
      { href: "/#about", label: "概要" },
      { href: "/#flow", label: "ご利用の流れ" },
      { href: "/#plans", label: "料金" },
      { href: "/#faq", label: "よくあるご質問" },
    ],
  },
  {
    title: "アカウント",
    links: [
      { href: "/signup", label: "会員登録" },
      { href: "/login", label: "ログイン" },
      { href: "/mypage", label: "マイページ" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-white pb-[max(0px,env(safe-area-inset-bottom))]">
      <Container className="py-12">
        <div className="mb-8">
          <Logo size="footer" />
          <p className="mt-3 text-sm text-ink-500">
            提示価格が相場と比べてどうかを、自分で確かめられる。
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-bold text-ink-900">{column.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-500">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}`}>
                    <Link href={link.href} className="hover:text-brand-600">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-10 text-xs leading-relaxed text-ink-300">
          本サービスの診断結果は、登録された基準データに基づく参考情報です。
          個別の物件の売買価格・投資成果を保証するものではなく、投資判断はご自身の責任でお願いいたします。
        </p>
        <p className="mt-4 text-xs text-ink-300">© ワンマケ</p>
      </Container>
    </footer>
  );
}
