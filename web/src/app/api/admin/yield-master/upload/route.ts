import { writeFileSync } from "node:fs";
import path from "node:path";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import {
  loadYieldMasterFromBuffer,
  replaceYieldMasterInDb,
  tryConvertXlsxToMaster,
} from "@/server/yield-master";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await requireAdmin();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("VALIDATION_ERROR", "ファイルを選択してください");
    }

    const name = file.name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());

    if (name.endsWith(".json")) {
      const master = loadYieldMasterFromBuffer(bytes);
      if (!process.env.VERCEL) {
        try {
          writeFileSync(
            path.join(process.cwd(), "data", "yield-master.json"),
            JSON.stringify(master, null, 2) + "\n",
            "utf-8",
          );
        } catch {
          // non-fatal on read-only hosts
        }
      }
      const stats = await replaceYieldMasterInDb(master);
      return ok({
        message: "JSON マスタを DB に反映しました",
        stats,
        source: "json",
      });
    }

    if (name.endsWith(".xlsx")) {
      const converted = tryConvertXlsxToMaster(bytes);
      if (!converted.ok) {
        return fail("DATA_UNAVAILABLE", converted.message);
      }
      const stats = await replaceYieldMasterInDb(converted.master);
      return ok({
        message: "xlsx を変換して DB に反映しました",
        stats,
        source: "xlsx",
      });
    }

    return fail(
      "VALIDATION_ERROR",
      ".json（推奨）または .xlsx をアップロードしてください。Vercel では JSON が確実です。",
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (error instanceof Error && /形式が不正|必要です|ありません/.test(error.message)) {
      return fail("VALIDATION_ERROR", error.message);
    }
    return internalError(error);
  }
}
