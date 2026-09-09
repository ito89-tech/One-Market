import type { NextRequest } from "next/server";

import { internalError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { uniquePreserveOrder } from "@/lib/station";

export async function GET(request: NextRequest) {
  try {
    const prefecture = request.nextUrl.searchParams.get("prefecture")?.trim();
    if (!prefecture) {
      return ok({ municipalities: [] });
    }

    const sheet =
      (await prisma.yieldSheet.findFirst({
        where: { prefectures: { has: prefecture } },
      })) ?? (await prisma.yieldSheet.findFirst({ where: { isFallback: true } }));

    if (!sheet) return ok({ municipalities: [] });

    const municipalities = await prisma.municipality.findMany({
      where: { sheetId: sheet.id },
      select: { name: true },
      orderBy: { name: "asc" },
    });

    return ok({
      municipalities: uniquePreserveOrder(
        municipalities.map((item) => item.name),
      ),
    });
  } catch (error) {
    return internalError(error);
  }
}
