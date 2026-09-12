import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { importYieldMasterFromXlsxBytes } from "@/server/yield-master";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("VALIDATION_ERROR", "xlsx ファイルを選択してください");
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      return fail(
        "VALIDATION_ERROR",
        "利回りシートの .xlsx のみアップロードできます（JSON 経由は使いません）。",
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stats = await importYieldMasterFromXlsxBytes(bytes, file.name);
    return ok({
      message: "xlsx を解析して PostgreSQL に反映しました",
      stats,
      source: "xlsx",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (
      error instanceof Error &&
      /見つかりません|形式が不正|解釈できません|未知のシート/.test(error.message)
    ) {
      return fail("VALIDATION_ERROR", error.message);
    }
    return internalError(error);
  }
}
