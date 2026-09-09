import Link from "next/link";

import { Container, LinkButton } from "./ui";

function Logo() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight text-ink-900"
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white"
      >
        ワ
      </span>
      <span className="truncate">ワンマケ</span>
    </Link>
  );
}

export function SiteHeader({
  user,
}: {
  user: { displayName: string | null; email: string; role: string } | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <Container className="flex min-h-14 items-center justify-between gap-3 py-2 sm:h-16 sm:py-0">
        <Logo />

        <nav
          aria-label="メインメニュー"
          className="flex shrink-0 items-center gap-1.5 sm:gap-3"
        >
          {user ? (
            <>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  className="px-2 py-2 text-sm font-bold text-ink-700 hover:text-brand-600"
                >
                  管理
                </Link>
              ) : null}
              <Link
                href="/mypage"
                className="px-2 py-2 text-sm font-bold text-ink-700 hover:text-brand-600"
              >
                マイページ
              </Link>
              <LinkButton
                href="/diagnosis/new"
                className="!min-h-10 !px-3 !text-sm sm:!px-4"
              >
                <span className="sm:hidden">診断する</span>
                <span className="hidden sm:inline">物件を診断する</span>
              </LinkButton>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-2 py-2 text-sm font-bold text-ink-700 hover:text-brand-600"
              >
                ログイン
              </Link>
              <LinkButton
                href="/diagnosis/new"
                className="!min-h-10 !px-3 !text-sm sm:!px-4"
              >
                <span className="sm:hidden">無料で確認</span>
                <span className="hidden sm:inline">無料で相場を確認</span>
              </LinkButton>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface-muted)] py-12 pb-[max(3rem,calc(2.5rem+env(safe-area-inset-bottom)))]">
      <Container>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              ワンルーム投資物件の提示価格が相場と比べてどうなのかを、
              かんたんに確認できるサービスです。
            </p>
          </div>

          <nav aria-label="サービス">
            <h2 className="text-sm font-bold text-ink-900">サービス</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <Link href="/diagnosis/new" className="hover:text-brand-600">
                  相場を確認する
                </Link>
              </li>
              <li>
                <Link href="/#flow" className="hover:text-brand-600">
                  ご利用の流れ
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-brand-600">
                  よくあるご質問
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="アカウント">
            <h2 className="text-sm font-bold text-ink-900">アカウント</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <Link href="/signup" className="hover:text-brand-600">
                  会員登録
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-brand-600">
                  ログイン
                </Link>
              </li>
              <li>
                <Link href="/mypage" className="hover:text-brand-600">
                  マイページ
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-[var(--color-line)] pt-6 text-xs leading-relaxed text-ink-300">
          本サービスの診断結果は、登録された基準データに基づく参考情報です。
          個別の物件の売買価格・投資成果を保証するものではなく、投資判断はご自身の責任でお願いいたします。
        </p>
        <p className="mt-4 text-xs text-ink-300">© ワンマケ</p>
      </Container>
    </footer>
  );
}
