import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { syncYieldMasterFromBundledXlsx } from "@/server/yield-master";

export const runtime = "nodejs";

export async function POST() {
  try {
    await assertSameOrigin();
    await requireAdmin();

    const stats = await syncYieldMasterFromBundledXlsx();
    return ok({
      message: "バンドル済み xlsx を PostgreSQL に反映しました",
      stats,
      source: "xlsx",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (error instanceof Error && /見つかりません|形式が不正|解釈できません/.test(error.message)) {
      return fail("DATA_UNAVAILABLE", error.message);
    }
    return internalError(error);
  }
}
