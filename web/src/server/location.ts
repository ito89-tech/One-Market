import "server-only";

import { prisma } from "@/lib/prisma";
import { stationLookupKey } from "@/lib/station";
import { PREFECTURES } from "@/lib/validation";
import { ensureYieldMasterReady } from "@/server/ensure-yield-master";

export type StationCandidate = {
  name: string;
  sheetKey: string;
  sheetName: string;
  prefectures: string[];
};

export type LocationResolution =
  | {
      ok: true;
      prefecture: string;
      municipality: string;
      station: string;
      kind: "unique" | "disambiguated" | "fallback";
      candidates: StationCandidate[];
    }
  | {
      ok: false;
      message: string;
      details: Record<string, string>;
      candidates: StationCandidate[];
    };

function uniqueSheets(rows: StationCandidate[]): StationCandidate[] {
  const seen = new Set<string>();
  const out: StationCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.sheetKey)) continue;
    seen.add(row.sheetKey);
    out.push(row);
  }
  return out;
}

export async function lookupStationCandidates(
  station: string,
): Promise<StationCandidate[]> {
  await ensureYieldMasterReady();

  const key = stationLookupKey(station);
  if (!key) return [];

  const rows = await prisma.station.findMany({
    where: { lookupKey: key },
    select: {
      name: true,
      sheet: { select: { key: true, name: true, prefectures: true } },
    },
  });

  return uniqueSheets(
    rows.map((row) => ({
      name: row.name,
      sheetKey: row.sheet.key,
      sheetName: row.sheet.name,
      prefectures: row.sheet.prefectures,
    })),
  );
}

export async function resolveLocationInput(input: {
  station: string;
  prefecture: string;
  municipality: string;
}): Promise<LocationResolution> {
  const station = input.station.trim();
  const prefecture = input.prefecture.trim();
  const municipality = input.municipality.trim();
  const candidates = await lookupStationCandidates(station);

  if (candidates.length === 1) {
    const hit = candidates[0];
    const allowed = new Set(hit.prefectures);
    const resolvedPrefecture =
      prefecture && allowed.has(prefecture) ? prefecture : "";
    return {
      ok: true,
      prefecture: resolvedPrefecture,
      municipality,
      station,
      kind: "unique",
      candidates,
    };
  }

  if (candidates.length > 1) {
    if (prefecture) {
      const hit = candidates.find((candidate) =>
        candidate.prefectures.includes(prefecture),
      );
      if (hit) {
        return {
          ok: true,
          prefecture,
          municipality,
          station,
          kind: "disambiguated",
          candidates,
        };
      }
    }
    return {
      ok: false,
      message: "同名の駅が複数の地域にあります。地域を選択してください。",
      details: { prefecture: "同名駅があるため、都道府県を選択してください" },
      candidates,
    };
  }

  if (!prefecture || !municipality) {
    return {
      ok: false,
      message:
        "この駅は基準データに登録されていないため、都道府県と市区町村を入力してください。",
      details: {
        ...(prefecture ? {} : { prefecture: "都道府県を選択してください" }),
        ...(municipality ? {} : { municipality: "市区町村を入力してください" }),
      },
      candidates,
    };
  }

  if (!(PREFECTURES as readonly string[]).includes(prefecture)) {
    return {
      ok: false,
      message: "都道府県を選択してください。",
      details: { prefecture: "都道府県を選択してください" },
      candidates,
    };
  }

  return {
    ok: true,
    prefecture,
    municipality,
    station,
    kind: "fallback",
    candidates,
  };
}
