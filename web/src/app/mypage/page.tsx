import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteButton } from "@/components/delete-button";
import { LogoutButton } from "@/components/logout-button";
import { UpgradeButton } from "@/components/upgrade-button";
import {
  Alert,
  Badge,
  Card,
  Container,
  DefinitionRow,
  LinkButton,
} from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isPaidFlowEnabled } from "@/lib/env";
import {
  JUDGEMENT_LABEL,
  formatDate,
  formatMan,
  formatManRange,
} from "@/lib/format";
import {
  listUserDiagnoses,
  resolveEntitlement,
} from "@/server/diagnosis";
import { getLatestPayment } from "@/server/payments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "マイページ" };

const JUDGEMENT_TONE = {
  UNDERPRICED: "under",
  FAIR: "fair",
  OVERPRICED: "over",
} as const;

export default async function MyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/mypage");

  // Sequential on purpose: the local PGlite database shares one session, and
  // overlapping Prisma queries can trip over named prepared statements.
  const diagnoses = await listUserDiagnoses(user.id);
  const entitlement = await resolveEntitlement(user);
  const latestPayment = await getLatestPayment(user.id);

  const paidFlowEnabled = isPaidFlowEnabled();
  const paymentStatusLabel = latestPayment
    ? latestPayment.status === "PAID"
      ? "お支払い済み"
      : latestPayment.status === "PENDING"
        ? "確認待ち"
        : latestPayment.status === "CANCELED"
          ? "中止"
          : latestPayment.status === "REFUNDED"
            ? "返金済み"
            : "未完了"
    : "まだありません";

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">
              マイページ
            </h1>
            <p className="mt-2 text-sm text-ink-500">
              {user.displayName ? `${user.displayName} さん` : user.email}
            </p>
          </div>
          <LogoutButton />
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="text-base font-bold text-ink-900">アカウント情報</h2>
            <dl className="mt-4">
              <DefinitionRow term="メールアドレス">
                <span className="break-all">{user.email}</span>
              </DefinitionRow>
              <DefinitionRow term="お名前">
                {user.displayName ?? "未設定"}
              </DefinitionRow>
              <DefinitionRow term="ご登録日">
                {formatDate(user.createdAt)}
              </DefinitionRow>
            </dl>
          </Card>

          <Card>
            <h2 className="text-base font-bold text-ink-900">ご利用状況</h2>
            <dl className="mt-4">
              <DefinitionRow term="無料診断">
                {user.freeDiagnosisUsedAt ? "ご利用済み" : "未利用（1回）"}
              </DefinitionRow>
              <DefinitionRow term="有料診断の残数">
                {entitlement.kind === "PAID" && entitlement.source === "unlimited"
                  ? "回数無制限プランで利用中"
                  : entitlement.kind === "PAID" && entitlement.source === "monthly_5"
                    ? `月5回までプラン（残り ${entitlement.remaining} 回）`
                    : `${user.paidCredits}回`}
              </DefinitionRow>
              <DefinitionRow term="次回の診断">
                {entitlement.kind === "FREE"
                  ? "無料でご利用いただけます"
                  : entitlement.kind === "PAID"
                    ? "有料枠でご利用いただけます"
                    : "お支払いが必要です"}
              </DefinitionRow>
              <DefinitionRow term="決済状態">
                {paymentStatusLabel}
              </DefinitionRow>
            </dl>

            <div className="mt-5 space-y-3">
              {entitlement.kind === "NONE" ? (
                paidFlowEnabled ? (
                  <UpgradeButton />
                ) : (
                  <Alert tone="info">
                    有料診断は現在準備中です。ご利用いただけるようになりましたら、
                    こちらでご案内いたします。
                  </Alert>
                )
              ) : (
                <LinkButton href="/diagnosis/new" className="w-full">
                  物件を診断する
                </LinkButton>
              )}
            </div>
          </Card>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink-900">診断履歴</h2>
            {diagnoses.length > 0 ? (
              <DeleteButton
                endpoint="/api/diagnosis"
                label="履歴をすべて削除"
                confirmLabel="すべて削除する"
              />
            ) : null}
          </div>

          <p className="mb-4 text-sm text-ink-500">
            履歴を削除しても、ご利用済みの無料診断・有料残数は戻りません。
          </p>

          {diagnoses.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-ink-500">
                まだ診断結果がありません。物件情報を入力すると、ここに履歴が並びます。
              </p>
              <div className="mt-5">
                <LinkButton href="/diagnosis/new">
                  無料で相場を確認してみる
                </LinkButton>
              </div>
            </Card>
          ) : (
            <ul className="space-y-3">
              {diagnoses.map((diagnosis) => (
                <Card as="li" key={diagnosis.id} className="!p-0">
                  <Link
                    href={`/diagnosis/${diagnosis.id}`}
                    className="block rounded-t-2xl p-5 hover:bg-[var(--color-surface-muted)] sm:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge tone={JUDGEMENT_TONE[diagnosis.judgement]}>
                        {JUDGEMENT_LABEL[diagnosis.judgement]}
                      </Badge>
                      <span className="text-sm text-ink-500">
                        {formatDate(diagnosis.createdAt)}
                      </span>
                      <span className="text-xs text-ink-300">
                        {diagnosis.plan === "FREE" ? "無料診断" : "有料診断"}
                      </span>
                    </div>
                    <p className="mt-3 text-[15px] font-bold leading-snug text-ink-900">
                      {[diagnosis.prefecture, diagnosis.municipality]
                        .filter(Boolean)
                        .join("")}
                      {diagnosis.prefecture || diagnosis.municipality ? "／" : ""}
                      {diagnosis.stationInput} 徒歩
                      {diagnosis.walkMinutes}分／築{diagnosis.buildingAge}年
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      提示価格 {formatMan(Number(diagnosis.priceYen) / 10_000)}
                      ／相場{" "}
                      {formatManRange(
                        diagnosis.marketPriceLowMan,
                        diagnosis.marketPriceHighMan,
                      )}
                    </p>
                  </Link>
                  {/* リンクの内側に置くと、削除ボタンを押すだけで結果画面へ遷移してしまう */}
                  <div className="flex justify-end border-t border-[var(--color-line)] px-5 py-3 sm:px-6">
                    <DeleteButton
                      endpoint={`/api/diagnosis/${diagnosis.id}`}
                      label="この履歴を削除"
                    />
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
