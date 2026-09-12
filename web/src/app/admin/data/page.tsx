import { AdminTable } from "@/components/admin-table";
import { Alert, Card } from "@/components/ui";
import { StationEditor } from "@/components/station-editor";
import { YieldMasterSyncPanel } from "@/components/yield-master-sync-panel";
import { YieldRateEditor } from "@/components/yield-rate-editor";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getYieldMasterStats } from "@/server/yield-master";

export default async function AdminDataPage() {
  const [sheets, issues, invalidRates, stats, rateRows, stations] =
    await Promise.all([
      prisma.yieldSheet.findMany({
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
      }),
      prisma.dataIssue.findMany({
        orderBy: [{ level: "asc" }, { code: "asc" }],
      }),
      prisma.yieldRate.findMany({
        where: { isValid: false },
        include: {
          sheet: { select: { name: true } },
          area: { select: { code: true } },
          ageBracket: { select: { label: true } },
        },
      }),
      getYieldMasterStats(),
      prisma.yieldRate.findMany({
        orderBy: [{ sheet: { key: "asc" } }, { ageBracket: { sort: "asc" } }],
        take: 2000,
        include: {
          sheet: { select: { name: true } },
          area: { select: { code: true } },
          ageBracket: { select: { label: true } },
        },
      }),
      prisma.station.findMany({
        orderBy: [{ sheet: { key: "asc" } }, { name: "asc" }],
        take: 2000,
        include: {
          sheet: { select: { id: true, name: true } },
          area: { select: { id: true, code: true } },
        },
      }),
    ]);

  return (
    <div className="space-y-8">
      <Alert tone="info" title="データの流れ">
        正本はクライアント提供の利回りシート.xlsx です。管理画面から xlsx を取り込むと、
        スキーマどおりに PostgreSQL（Neon）へ直接反映されます。診断計算もこの DB
        だけを参照します。取込後の不足・修正は、下の編集パネルで PostgreSQL
        上の値を直接更新できます。
      </Alert>

      <YieldMasterSyncPanel initialStats={stats} />

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
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <YieldRateEditor
        initialRows={rateRows.map((rate) => ({
          id: rate.id,
          sheetName: rate.sheet.name,
          areaCode: rate.area.code,
          ageLabel: rate.ageBracket.label,
          lowPercent: Number(rate.lowPercent),
          highPercent: Number(rate.highPercent),
          isValid: rate.isValid,
          raw: rate.raw,
        }))}
      />

      <StationEditor
        sheets={sheets.map((sheet) => ({
          id: sheet.id,
          name: sheet.name,
          areas: sheet.areas.map((area) => ({
            id: area.id,
            code: area.code,
            label: area.label,
          })),
        }))}
        initialStations={stations.map((station) => ({
          id: station.id,
          name: station.name,
          lookupKey: station.lookupKey,
          sheetId: station.sheet.id,
          sheetName: station.sheet.name,
          areaId: station.area.id,
          areaCode: station.area.code,
        }))}
      />

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
                {sheet._count.yieldRates} 件／「それ以外」= {sheet.defaultArea}
                エリア
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
