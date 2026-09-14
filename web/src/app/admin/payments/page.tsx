import { AdminTable } from "@/components/admin-table";
import { formatDate } from "@/lib/format";
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

  return (
    <div className="space-y-8">
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
