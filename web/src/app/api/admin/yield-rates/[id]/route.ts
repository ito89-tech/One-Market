import { z } from "zod";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearSheetCache } from "@/server/engine/dataset";

export const runtime = "nodejs";

const patchSchema = z.object({
  lowPercent: z.number().positive().max(100),
  highPercent: z.number().positive().max(100),
  isValid: z.boolean(),
  raw: z.string().trim().min(1).max(40).optional(),
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

    const { lowPercent, highPercent, isValid } = parsed.data;
    if (lowPercent > highPercent && isValid) {
      return fail(
        "VALIDATION_ERROR",
        "有効なセルでは下限が上限以下である必要があります。",
      );
    }

    const raw =
      parsed.data.raw ??
      `${lowPercent.toFixed(2)}%-${highPercent.toFixed(2)}%`;

    const updated = await prisma.yieldRate.update({
      where: { id },
      data: {
        lowPercent,
        highPercent,
        isValid,
        raw,
      },
      include: {
        sheet: { select: { name: true } },
        area: { select: { code: true } },
        ageBracket: { select: { label: true } },
      },
    });

    clearSheetCache();
    return ok({
      id: updated.id,
      sheet: updated.sheet.name,
      area: updated.area.code,
      age: updated.ageBracket.label,
      lowPercent: Number(updated.lowPercent),
      highPercent: Number(updated.highPercent),
      isValid: updated.isValid,
      raw: updated.raw,
    });
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
    await prisma.yieldRate.delete({ where: { id } });
    clearSheetCache();
    return ok({ deleted: id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
