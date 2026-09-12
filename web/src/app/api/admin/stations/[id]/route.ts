import { z } from "zod";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stationLookupKey } from "@/lib/station";
import { clearSheetCache } from "@/server/engine/dataset";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  areaId: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail("VALIDATION_ERROR", "入力内容をご確認ください。");
    }

    const data: { name?: string; lookupKey?: string; areaId?: string } = {};
    if (parsed.data.name) {
      data.name = parsed.data.name;
      data.lookupKey = stationLookupKey(parsed.data.name);
    }
    if (parsed.data.areaId) data.areaId = parsed.data.areaId;

    const updated = await prisma.station.update({ where: { id }, data });
    clearSheetCache();
    return ok(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    await requireAdmin();
    const { id } = await context.params;
    await prisma.station.delete({ where: { id } });
    clearSheetCache();
    return ok({ deleted: id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
