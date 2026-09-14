import type { Metadata } from "next";

import { Alert, Card, Container, LinkButton } from "@/components/ui";
import { VerifyToken } from "@/components/verify-token";
import { safeNext } from "@/lib/next-param";

export const metadata: Metadata = { title: "メールアドレスの確認" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  const destination = safeNext(next);

  return (
    <div className="bg-[var(--color-surface-muted)]">
      <Container className="py-14 sm:py-20">
        <div className="mx-auto max-w-md">
          {token ? (
            <VerifyToken token={token} next={destination} />
          ) : (
            <Card className="text-center">
              <h1 className="text-xl font-bold text-ink-900">
                確認リンクが見つかりません
              </h1>
              <div className="mt-5 text-left">
                <Alert tone="error">
                  メール内のリンクをもう一度開いてください。リンクの有効期限は30分です。
                </Alert>
              </div>
              <div className="mt-6">
                <LinkButton href="/login" className="w-full">
                  ログイン画面へ
                </LinkButton>
              </div>
            </Card>
          )}
        </div>
      </Container>
    </div>
  );
}
