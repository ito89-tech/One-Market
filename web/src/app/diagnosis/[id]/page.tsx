import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  Badge,
  Card,
  Container,
  DefinitionRow,
  LinkButton,
} from "@/components/ui";
import { DeleteButton } from "@/components/delete-button";
import { getCurrentUser } from "@/lib/auth";
import {
  JUDGEMENT_HEADLINE,
  JUDGEMENT_LABEL,
  JUDGEMENT_SUMMARY,
  describeDifference,
  formatDate,
  formatMan,
  formatManRange,
  formatYen,
} from "@/lib/format";
import { findUserDiagnosis } from "@/server/diagnosis";

export const metadata: Metadata = { title: "診断結果" };

const JUDGEMENT_TONE = {
  UNDERPRICED: "under",
  FAIR: "fair",
  OVERPRICED: "over",
} as const;

const JUDGEMENT_ACCENT = {
  UNDERPRICED: "var(--color-judge-under)",
  FAIR: "var(--color-judge-fair)",
  OVERPRICED: "var(--color-judge-over)",
} as const;

export default async function DiagnosisResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/diagnosis/${id}`)}`);
  }

  // Scoped by userId, so another account's id simply looks like a 404.
  const diagnosis = await findUserDiagnosis(user.id, id);
  if (!diagnosis) notFound();

  const { judgement } = diagnosis;
  const difference = describeDifference(
    judgement,
    diagnosis.differenceLowMan,
    diagnosis.differenceHighMan,
  );
  const listedMan = Number(diagnosis.priceYen) / 10_000;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {/* 1. 結論を最初に置く */}
        <Card className="text-center">
          <p className="text-sm text-ink-500">診断結果</p>
          <h1
            className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]"
            style={{ color: JUDGEMENT_ACCENT[judgement] }}
          >
            {JUDGEMENT_HEADLINE[judgement]}
          </h1>
          <div className="mt-4">
            <Badge tone={JUDGEMENT_TONE[judgement]}>
              判定：{JUDGEMENT_LABEL[judgement]}
            </Badge>
          </div>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink-500">
            {JUDGEMENT_SUMMARY[judgement]}
          </p>
        </Card>

        {/* 2. 相場価格 3. 提示価格との比較 */}
        <Card className="mt-4">
          <h2 className="text-base font-bold text-ink-900">価格の比較</h2>
          <dl className="mt-4">
            <DefinitionRow term="相場価格">
              {formatManRange(
                diagnosis.marketPriceLowMan,
                diagnosis.marketPriceHighMan,
              )}
            </DefinitionRow>
            <DefinitionRow term="提示価格">{formatMan(listedMan)}</DefinitionRow>
          </dl>

          <p
            className="mt-5 rounded-xl px-4 py-3 text-[15px] font-bold"
            style={{
              backgroundColor: "var(--color-surface-muted)",
              color: JUDGEMENT_ACCENT[judgement],
            }}
          >
            {difference ?? "提示価格は相場価格の範囲に収まっています"}
          </p>
        </Card>

        {/* 4. 補足 */}
        <Card className="mt-4">
          <h2 className="text-base font-bold text-ink-900">診断した物件</h2>
          <dl className="mt-4">
            <DefinitionRow term="所在地">
              {diagnosis.prefecture || diagnosis.municipality
                ? `${diagnosis.prefecture}${diagnosis.municipality}`
                : "最寄り駅から判定"}
            </DefinitionRow>
            <DefinitionRow term="最寄り駅">
              {diagnosis.stationInput}（徒歩{diagnosis.walkMinutes}分）
            </DefinitionRow>
            <DefinitionRow term="築年数">{diagnosis.buildingAge}年</DefinitionRow>
            <DefinitionRow term="月額賃料">
              {formatYen(diagnosis.monthlyRentYen)}
            </DefinitionRow>
            <DefinitionRow term="管理費">
              {formatYen(diagnosis.managementFeeYen)}
            </DefinitionRow>
            <DefinitionRow term="修繕積立金">
              {formatYen(diagnosis.repairReserveYen)}
            </DefinitionRow>
            <DefinitionRow term="診断日時">
              {formatDate(diagnosis.createdAt)}
            </DefinitionRow>
          </dl>
        </Card>

        <div className="mt-6 space-y-3">
          <LinkButton href="/diagnosis/new" className="w-full">
            別の物件も診断する
          </LinkButton>
          <LinkButton href="/mypage" variant="quiet" className="w-full">
            マイページで履歴を見る
          </LinkButton>
          <div className="flex justify-center">
            <DeleteButton
              endpoint={`/api/diagnosis/${diagnosis.id}`}
              label="この診断結果を削除"
              confirmLabel="本当に削除"
              redirectTo="/mypage"
            />
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-ink-300">
          相場価格は、月額賃料から管理費と修繕積立金を差し引いた実質的な収入をもとに、
          エリアと築年数ごとの基準と照らし合わせて算出した参考値です。
          金額は1万円未満を切り捨てて表示しています。
          実際の売買価格は物件の個別事情や交渉によって変わります。
          本サービスの結果は投資成果を保証するものではありません。
        </p>
      </div>
    </Container>
  );
}
