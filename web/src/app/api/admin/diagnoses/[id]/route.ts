import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { requireRuntimeSecrets } from "@/lib/prisma";
import { deleteDiagnosisAsAdmin } from "@/server/diagnosis";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();
    await requireAdmin();
    const { id } = await params;

    const deleted = await deleteDiagnosisAsAdmin(id);
    if (!deleted) {
      return fail("NOT_FOUND", "対象の診断結果が見つかりませんでした。");
    }

    return ok({ id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
