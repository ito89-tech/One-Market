import { AdminTable } from "@/components/admin-table";
import { Alert } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { isPaidFlowEnabled, serverEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });

  const secret = serverEnv.stripe.secretKey();
  const testMode = Boolean(secret) && secret.startsWith("sk_test_");

  return (
    <div className="space-y-8">
      {testMode ? (
        <Alert tone="info" title="Stripe Test Mode">
          sk_test_ キーでサンドボックス検証中です。テスト用 Price ID と
          Webhook（/api/stripe/webhook）を設定すれば有料フローを確認できます。
          本番課金には sk_live_ は必須ではなく、検証完了後に差し替えてください。
        </Alert>
      ) : !isPaidFlowEnabled() ? (
        <Alert tone="warning" title="有料フロー未設定">
          STRIPE_SECRET_KEY（sk_test_ 可）・Price ID・（公開ホストでは）Webhook
          シークレットを設定すると有料導線が有効になります。詳細は docs/deployment.md を参照。
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-base font-bold text-ink-900">決済</h2>
        <AdminTable
          columns={["日時", "ユーザー", "金額", "状態", "付与回数", "Checkout Session"]}
          rows={payments.map((payment) => [
            formatDate(payment.createdAt),
            payment.user.email,
            `${payment.amount.toLocaleString("ja-JP")} ${payment.currency.toUpperCase()}`,
            payment.status,
            payment.creditsGranted,
            payment.stripeCheckoutSessionId,
          ])}
          empty="決済はまだありません"
        />
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold text-ink-900">サブスクリプション</h2>
        <AdminTable
          columns={["作成日", "ユーザー", "状態", "現在の期間終了", "期末解約", "Subscription ID"]}
          rows={subscriptions.map((subscription) => [
            formatDate(subscription.createdAt),
            subscription.user.email,
            subscription.status,
            subscription.currentPeriodEnd
              ? formatDate(subscription.currentPeriodEnd)
              : "—",
            subscription.cancelAtPeriodEnd ? "あり" : "なし",
            subscription.stripeSubscriptionId,
          ])}
          empty="サブスクリプションはまだありません"
        />
      </section>
    </div>
  );
}
