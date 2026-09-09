import type { NextRequest } from "next/server";

import { internalError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { stationLookupKey, uniquePreserveOrder } from "@/lib/station";

/**
 * Station names for the input field. Area codes are internal and not returned.
 */
export async function GET(request: NextRequest) {
  try {
    const prefecture = request.nextUrl.searchParams.get("prefecture")?.trim();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (prefecture) {
      const sheet =
        (await prisma.yieldSheet.findFirst({
          where: { prefectures: { has: prefecture } },
        })) ?? (await prisma.yieldSheet.findFirst({ where: { isFallback: true } }));

      if (!sheet) return ok({ stations: [] as string[] });

      const stations = await prisma.station.findMany({
        where: { sheetId: sheet.id },
        select: { name: true },
        orderBy: { name: "asc" },
      });
      return ok({
        stations: uniquePreserveOrder(stations.map((station) => station.name)),
      });
    }

    const stations = await prisma.station.findMany({
      select: {
        name: true,
        lookupKey: true,
        sheet: { select: { key: true, name: true, prefectures: true } },
      },
      orderBy: { name: "asc" },
    });

    const needle = query ? stationLookupKey(query) : "";
    const filtered = needle
      ? stations.filter(
          (station) =>
            station.lookupKey.includes(needle) || station.name.includes(query),
        )
      : stations;

    return ok({
      stations: uniquePreserveOrder(filtered.map((station) => station.name)),
      matches: filtered.map((station) => ({
        name: station.name,
        lookupKey: station.lookupKey,
        sheetKey: station.sheet.key,
        sheetName: station.sheet.name,
        prefectures: station.sheet.prefectures,
      })),
    });
  } catch (error) {
    return internalError(error);
  }
}
