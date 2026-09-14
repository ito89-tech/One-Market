import { AdminTable } from "@/components/admin-table";
import { DeleteButton } from "@/components/delete-button";
import { JUDGEMENT_LABEL, formatDate, formatMan } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const MATCHED_BY_LABEL: Record<string, string> = {
  station: "駅名",
  locality: "市区町村",
  default: "それ以外",
};

export default async function AdminDiagnosesPage() {
  const diagnoses = await prisma.propertyDiagnosis.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="space-y-4">
      <AdminTable
        columns={[
          "日時",
          "ユーザー",
          "所在地",
          "最寄り駅",
          "築年数",
          "提示価格",
          "相場",
          "判定",
          "エリア",
          "判定方法",
          "基準",
          "内部収益率",
          "区分",
          "操作",
        ]}
        rows={diagnoses.map((diagnosis) => [
          formatDate(diagnosis.createdAt),
          diagnosis.user.email,
          `${diagnosis.prefecture}${diagnosis.municipality}`,
          `${diagnosis.stationInput}（徒歩${diagnosis.walkMinutes}分）`,
          `${diagnosis.buildingAge}年`,
          formatMan(Number(diagnosis.priceYen) / 10_000),
          `${diagnosis.marketPriceLowMan}〜${diagnosis.marketPriceHighMan}万円`,
          JUDGEMENT_LABEL[diagnosis.judgement],
          `${diagnosis.sheetKey} / ${diagnosis.areaCode}`,
          `${MATCHED_BY_LABEL[diagnosis.matchedBy] ?? diagnosis.matchedBy}${
            diagnosis.matchedValue ? `（${diagnosis.matchedValue}）` : ""
          }`,
          `築${diagnosis.ageBracketLabel} / ${diagnosis.rateLowPercent.toString()}%-${diagnosis.rateHighPercent.toString()}%`,
          `${Number(diagnosis.yieldPercent).toFixed(3)}%`,
          diagnosis.plan === "FREE" ? "無料" : "有料",
          <DeleteButton
            key={`delete-${diagnosis.id}`}
            endpoint={`/api/admin/diagnoses/${diagnosis.id}`}
            label="履歴を削除"
          />,
        ])}
      />
    </div>
  );
}
