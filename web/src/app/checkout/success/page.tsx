import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert, Card, Container, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isMockPaymentsAllowed } from "@/lib/env";
import { hasActiveSubscription } from "@/server/diagnosis";

export const metadata: Metadata = { title: "お支払い完了" };
export const dynamic = "force-dynamic";

/**
 * Reaching this page proves only that Stripe redirected here. Entitlement is
 * read back from the database, which is updated by the signed webhook, so a
 * hand-crafted URL grants nothing.
 */
export default async function CheckoutSuccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout/success");

  const subscribed = await hasActiveSubscription(user.id);
  const usable = user.paidCredits > 0 || subscribed;
  const mock = isMockPaymentsAllowed();

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <h1 className="text-xl font-bold text-ink-900">
            お手続きありがとうございます
          </h1>

          {mock ? (
            <div className="mt-5 text-left">
              <Alert tone="warning" title="TEST ONLY">
                これは開発環境用のテスト決済です。本番の料金は発生していません。
              </Alert>
            </div>
          ) : null}

          {usable ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                有料診断をご利用いただけます。
                {subscribed
                  ? "定額プランでご利用中です。"
                  : `残り ${user.paidCredits} 回ご利用いただけます。`}
              </p>
              <div className="mt-6 space-y-3">
                <LinkButton href="/diagnosis/run" className="w-full">
                  入力済みの物件を診断する
                </LinkButton>
                <LinkButton href="/mypage" variant="quiet" className="w-full">
                  マイページへ
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <div className="mt-5 text-left">
                <Alert tone="info">
                  決済の確認処理が完了するまで、少しお時間をいただく場合があります。
                  1〜2分ほど経ってからマイページをご確認ください。
                </Alert>
              </div>
              <div className="mt-6">
                <LinkButton href="/mypage" className="w-full">
                  マイページで状況を確認する
                </LinkButton>
              </div>
            </>
          )}
        </Card>
      </div>
    </Container>
  );
}
