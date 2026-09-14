import { AdminTable } from "@/components/admin-table";
import { AdminUserCreate } from "@/components/admin-user-create";
import { DeleteButton } from "@/components/delete-button";
import { getCurrentUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
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

  const bootstrapAdmins = serverEnv.adminEmails();

  return (
    <div className="space-y-6">
      <AdminUserCreate />

      <p className="text-sm text-ink-500">
        開発者アカウントは環境変数{" "}
        <code className="font-mono text-xs">ADMIN_EMAILS</code>
        {bootstrapAdmins.length > 0 ? (
          <>
            （{bootstrapAdmins.map((email) => (
              <span key={email} className="break-all">
                {email}
              </span>
            ))}
            ）
          </>
        ) : null}
        で管理者になります。実地の管理者は下の「ユーザーを登録する」から権限「管理者」で追加してください。
        ユーザーを削除すると、そのユーザーの診断履歴・決済記録・ログイン情報もすべて削除されます。
      </p>

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
