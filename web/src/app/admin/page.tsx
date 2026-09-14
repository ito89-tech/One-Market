import { Alert, Card } from "@/components/ui";
import { engineHealth } from "@/lib/engine";
import { prisma } from "@/lib/prisma";

export default async function AdminOverviewPage() {
  const users = await prisma.user.count();
  const diagnoses = await prisma.propertyDiagnosis.count();
  const freeUsed = await prisma.user.count({
    where: { freeDiagnosisUsedAt: { not: null } },
  });
  const payments = await prisma.payment.count();
  const paidPayments = await prisma.payment.count({ where: { status: "PAID" } });
  const issues = await prisma.dataIssue.findMany({ orderBy: { level: "asc" } });
  const health = await engineHealth();

  const blockers = issues.filter((issue) => issue.level === "BLOCKER");

  const stats = [
    { label: "登録ユーザー", value: users },
    { label: "診断実行数", value: diagnoses },
    { label: "無料診断 利用済み", value: freeUsed },
    { label: "決済（作成/成立）", value: `${payments} / ${paidPayments}` },
  ];

  return (
    <div className="space-y-6">
      {blockers.length > 0 ? (
        <Alert tone="error" title={`未解決の問題が ${blockers.length} 件あります`}>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {blockers.map((issue) => (
              <li key={issue.id}>
                {issue.sheetName}：{issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-ink-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-base font-bold text-ink-900">診断エンジン</h2>
        {health.ok ? (
          <p className="mt-3 text-sm text-ink-500">基準データを読み込めました。</p>
        ) : (
          <div className="mt-3">
            <Alert tone="error">基準データを読み込めません。</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
