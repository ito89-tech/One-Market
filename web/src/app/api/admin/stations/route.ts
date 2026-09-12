import { z } from "zod";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stationLookupKey } from "@/lib/station";
import { clearSheetCache } from "@/server/engine/dataset";

export const runtime = "nodejs";

const createSchema = z.object({
  sheetId: z.string().min(1),
  areaId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", "駅名とエリアを確認してください。");
    }

    const lookupKey = stationLookupKey(parsed.data.name);
    if (!lookupKey) {
      return fail("VALIDATION_ERROR", "駅名を入力してください。");
    }

    const created = await prisma.station.create({
      data: {
        sheetId: parsed.data.sheetId,
        areaId: parsed.data.areaId,
        name: parsed.data.name.trim(),
        lookupKey,
        sourceColumn: 0,
      },
    });
    clearSheetCache();
    return ok(created);
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
