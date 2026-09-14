import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { requireRuntimeSecrets } from "@/lib/prisma";
import { deleteUserAsAdmin } from "@/server/users";

const REASON_MESSAGE = {
  not_found: "対象のユーザーが見つかりませんでした。",
  self: "ご自身のアカウントはここから削除できません。",
  last_admin: "管理者が1人だけのため削除できません。先に別の管理者を作成してください。",
} as const;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();
    const admin = await requireAdmin();
    const { id } = await params;

    const result = await deleteUserAsAdmin({ actorId: admin.id, targetId: id });
    if (!result.ok) {
      return fail(
        result.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN",
        REASON_MESSAGE[result.reason],
      );
    }

    return ok({ id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
