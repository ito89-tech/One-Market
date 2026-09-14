import { AdminTable } from "@/components/admin-table";
import { AdminUserCreate } from "@/components/admin-user-create";
import { DeleteButton } from "@/components/delete-button";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const viewer = await getCurrentUser();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { diagnoses: true } },
      subscriptions: { select: { status: true } },
    },
  });

  const adminCount = users.filter((user) => user.role === "ADMIN").length;

  return (
    <div className="space-y-6">
      <AdminUserCreate />

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
          "操作",
        ]}
        rows={users.map((user) => {
          // 自分自身と最後の管理者はサーバー側でも拒否する。
          const removable =
            user.id !== viewer?.id && (user.role !== "ADMIN" || adminCount > 1);

          return [
            user.email,
            user.displayName ?? "—",
            user.role,
            user.freeDiagnosisUsedAt ? formatDate(user.freeDiagnosisUsedAt) : "未利用",
            user.paidCredits,
            user.subscriptions.map((s) => s.status).join(", ") || "—",
            user._count.diagnoses,
            formatDate(user.createdAt),
            removable ? (
              <DeleteButton
                endpoint={`/api/admin/users/${user.id}`}
                label="ユーザーを削除"
                confirmLabel="本当に削除"
              />
            ) : (
              <span className="text-xs text-ink-300">削除不可</span>
            ),
          ];
        })}
      />
    </div>
  );
}
