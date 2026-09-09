import { AdminTable } from "@/components/admin-table";
import { Alert, Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function AdminDataPage() {
  const sheets = await prisma.yieldSheet.findMany({
    orderBy: { key: "asc" },
    include: {
      areas: {
        orderBy: { sort: "asc" },
        include: {
          _count: { select: { stations: true, localities: true } },
        },
      },
      _count: { select: { yieldRates: true, ageBrackets: true } },
    },
  });
  const issues = await prisma.dataIssue.findMany({
    orderBy: [{ level: "asc" }, { code: "asc" }],
  });

  const invalidRates = await prisma.yieldRate.findMany({
    where: { isValid: false },
    include: {
      sheet: { select: { name: true } },
      area: { select: { code: true } },
      ageBracket: { select: { label: true } },
    },
  });

  return (
    <div className="space-y-8">
      <Alert tone="info" title="このデータについて">
        クライアント提供の「利回りシート.xlsx」を変換して取り込んだものです。
        値の補完・修正は一切行っていません。更新する場合は xlsx を差し替えて
        <code className="mx-1 rounded bg-white px-1">python tools/build_yield_dataset.py</code>
        と <code className="mx-1 rounded bg-white px-1">npm run db:seed</code> を実行してください。
      </Alert>

      {invalidRates.length > 0 ? (
        <Alert
          tone="error"
          title={`診断に使用できないセルが ${invalidRates.length} 件あります`}
        >
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {invalidRates.map((rate) => (
              <li key={rate.id}>
                {rate.sheet.name} / {rate.area.code}エリア / 築
                {rate.ageBracket.label}：<code>{rate.raw}</code>
                （下限が上限を上回っています。クライアント確認待ち）
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-base font-bold text-ink-900">シート構成</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {sheets.map((sheet) => (
            <Card key={sheet.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-ink-900">{sheet.name}</h3>
                <span className="text-xs text-ink-300">{sheet.key}</span>
              </div>
              <p className="mt-2 text-sm text-ink-500">
                対象：{sheet.prefectures.join("・")}
                {sheet.isFallback ? "（記載外の都道府県もここに含む）" : ""}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                築年数区分 {sheet._count.ageBrackets} 件／収益率セル{" "}
                {sheet._count.yieldRates} 件／「それ以外」= {sheet.defaultArea}エリア
              </p>
              <ul className="mt-3 space-y-1 text-sm text-ink-700">
                {sheet.areas.map((area) => (
                  <li key={area.id}>
                    {area.label}：駅 {area._count.stations} 件／市区町村{" "}
                    {area._count.localities} 件
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-300">
                取り込み日時：{formatDate(sheet.generatedAt)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold text-ink-900">データ検証結果</h2>
        <AdminTable
          columns={["レベル", "シート", "コード", "内容"]}
          rows={issues.map((issue) => [
            issue.level,
            issue.sheetName,
            issue.code,
            issue.message,
          ])}
          empty="検出された問題はありません"
        />
      </section>
    </div>
  );
}
