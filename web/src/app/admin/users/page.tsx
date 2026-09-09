import { AdminTable } from "@/components/admin-table";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { diagnoses: true } },
      subscriptions: { select: { status: true } },
    },
  });

  return (
    <AdminTable
      columns={[
        "メールアドレス",
        "お名前",
        "権限",
        "無料診断",
        "有料残数",
        "サブスク",
        "診断数",
        "登録日",
      ]}
      rows={users.map((user) => [
        user.email,
        user.displayName ?? "—",
        user.role,
        user.freeDiagnosisUsedAt ? formatDate(user.freeDiagnosisUsedAt) : "未利用",
        user.paidCredits,
        user.subscriptions.map((s) => s.status).join(", ") || "—",
        user._count.diagnoses,
        formatDate(user.createdAt),
      ])}
    />
  );
}
