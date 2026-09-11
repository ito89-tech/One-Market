/**
 * 基準データの参照層。
 *
 * engine/app/dataset.py の移植だが、真実の置き場は JSON ではなく PostgreSQL。
 * シードで投入された YieldSheet / Station / Municipality / AgeBracket /
 * YieldRate をそのまま引く。値の補正・推測は一切しない（不正セルは不正のまま
 * DATA_UNAVAILABLE にする）。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { localityLookupKey, stationLookupKey } from "@/lib/station";

import { Decimal, DiagnosisError, type RateRange } from "./calc";

/**
 * 市区町村の照合順。狭い行政単位を先に見る。逆にすると関西シートで
 * 大阪市（②）が淀川区（③）を隠してしまう。
 */
const LOCALITY_PRIORITY = ["ward", "city", "town", "other"] as const;

export type EngineSheet = {
  id: string;
  key: string;
  name: string;
  prefectures: string[];
  isFallback: boolean;
  defaultArea: string;
};

export type AreaMatch = {
  areaCode: string;
  matchedBy: "station" | "locality" | "default";
  matchedValue: string | null;
};

/**
 * シートは4行しかなく、再シードするまで変わらない。診断ごとに引き直す必要は
 * ないため短時間だけキャッシュする。TTL を置いているのは、再シード後に
 * 再デプロイ無しでも追従させるため。
 */
const SHEET_CACHE_TTL_MS = 60_000;
let sheetCache: { sheets: EngineSheet[]; loadedAt: number } | null = null;

export async function loadSheets(): Promise<EngineSheet[]> {
  const now = Date.now();
  if (sheetCache && now - sheetCache.loadedAt < SHEET_CACHE_TTL_MS) {
    return sheetCache.sheets;
  }

  const sheets = await prisma.yieldSheet.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      prefectures: true,
      isFallback: true,
      defaultArea: true,
    },
  });

  sheetCache = { sheets, loadedAt: now };
  return sheets;
}

/** テストと再シード直後に備えた明示的な破棄。 */
export function clearSheetCache(): void {
  sheetCache = null;
}

function normaliseCommon(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

/** 記載外の都道府県はフォールバックシート（愛知・その他）に寄せる。 */
export function resolveSheetByPrefecture(
  sheets: EngineSheet[],
  prefecture: string,
): EngineSheet {
  const needle = normaliseCommon(prefecture);
  const hit = sheets.find((sheet) =>
    sheet.prefectures.some((name) => normaliseCommon(name) === needle),
  );
  if (hit) return hit;

  const fallback = sheets.find((sheet) => sheet.isFallback);
  if (!fallback) {
    throw new DiagnosisError(
      "DATA_UNAVAILABLE",
      "基準データが未投入のため診断できません",
    );
  }
  return fallback;
}

type StationHit = { sheet: EngineSheet; areaCode: string };

/** その駅名を含むシート。未登録なら空配列。 */
export async function findStationHits(station: string): Promise<StationHit[]> {
  const key = stationLookupKey(station);
  if (!key) return [];

  const rows = await prisma.station.findMany({
    where: { lookupKey: key },
    select: {
      area: { select: { code: true } },
      sheet: {
        select: {
          id: true,
          key: true,
          name: true,
          prefectures: true,
          isFallback: true,
          defaultArea: true,
        },
      },
    },
  });

  // 同一シート内に同じ照合キーは1件しか入らない（@@unique）ため、
  // ここでの重複はシート跨ぎのみ。
  const seen = new Set<string>();
  const hits: StationHit[] = [];
  for (const row of rows) {
    if (seen.has(row.sheet.key)) continue;
    seen.add(row.sheet.key);
    hits.push({ sheet: row.sheet, areaCode: row.area.code });
  }
  return hits;
}

/**
 * 駅マスタで一意にシートが決まるなら駅を優先する。
 * 複数地域に同名駅がある場合は黙って選ばず、都道府県の指定を求める。
 */
export async function resolveSheetForInput(input: {
  prefecture: string;
  station: string;
  municipality: string;
}): Promise<EngineSheet> {
  const sheets = await loadSheets();
  if (sheets.length === 0) {
    throw new DiagnosisError(
      "DATA_UNAVAILABLE",
      "基準データが未投入のため診断できません",
    );
  }

  const hits = await findStationHits(input.station);

  if (hits.length === 1) return hits[0].sheet;

  if (hits.length > 1) {
    if (input.prefecture.trim()) {
      const chosen = resolveSheetByPrefecture(sheets, input.prefecture);
      if (hits.some((hit) => hit.sheet.key === chosen.key)) return chosen;
    }
    const names = hits.map((hit) => hit.sheet.name).join("、");
    throw new DiagnosisError(
      "AMBIGUOUS_STATION",
      `同名の駅が複数の地域にあります（${names}）。都道府県を選択してください。`,
    );
  }

  if (!input.prefecture.trim() || !input.municipality.trim()) {
    throw new DiagnosisError(
      "LOCATION_REQUIRED",
      "この駅は基準データに登録されていないため、都道府県と市区町村を入力してください。",
    );
  }

  return resolveSheetByPrefecture(sheets, input.prefecture);
}

/** 駅名 → 市区町村 → それ以外 の順で照合する。順序を入れ替えてはいけない。 */
export async function resolveArea(
  sheet: EngineSheet,
  station: string,
  municipality: string,
): Promise<AreaMatch> {
  const stationKey = stationLookupKey(station);
  if (stationKey) {
    const hit = await prisma.station.findUnique({
      where: { sheetId_lookupKey: { sheetId: sheet.id, lookupKey: stationKey } },
      select: { area: { select: { code: true } } },
    });
    if (hit) {
      return {
        areaCode: hit.area.code,
        matchedBy: "station",
        matchedValue: stationKey,
      };
    }
  }

  const municipalityKey = localityLookupKey(municipality);
  if (municipalityKey) {
    const rows = await prisma.municipality.findMany({
      where: { sheetId: sheet.id, lookupKey: municipalityKey },
      select: { kind: true, area: { select: { code: true } } },
    });
    if (rows.length > 0) {
      const ranked = [...rows].sort((a, b) => rankKind(a.kind) - rankKind(b.kind));
      return {
        areaCode: ranked[0].area.code,
        matchedBy: "locality",
        matchedValue: municipalityKey,
      };
    }
  }

  return {
    areaCode: sheet.defaultArea,
    matchedBy: "default",
    matchedValue: null,
  };
}

function rankKind(kind: string): number {
  const index = LOCALITY_PRIORITY.indexOf(
    kind as (typeof LOCALITY_PRIORITY)[number],
  );
  return index === -1 ? LOCALITY_PRIORITY.length - 1 : index;
}

/** 築年数区分と、そのエリアの利回りレンジ。不正セルは値を直さず弾く。 */
export async function findYieldRate(
  sheet: EngineSheet,
  areaCode: string,
  buildingAge: number,
): Promise<{ ageBracketLabel: string; rate: RateRange }> {
  const bracket = await prisma.ageBracket.findFirst({
    where: {
      sheetId: sheet.id,
      ageMin: { lte: buildingAge },
      OR: [{ ageMax: null }, { ageMax: { gte: buildingAge } }],
    },
    orderBy: { sort: "asc" },
    select: {
      label: true,
      yieldRates: {
        where: { area: { code: areaCode } },
        select: {
          lowPercent: true,
          highPercent: true,
          raw: true,
          isValid: true,
        },
        take: 1,
      },
    },
  });

  if (!bracket) {
    throw new DiagnosisError(
      "AGE_OUT_OF_RANGE",
      "入力された築年数に対応する基準データがありません",
    );
  }

  const cell = bracket.yieldRates[0];
  if (!cell || !cell.isValid) {
    throw new DiagnosisError(
      "DATA_UNAVAILABLE",
      "この条件の基準データは現在ご利用いただけません",
    );
  }

  return {
    ageBracketLabel: bracket.label,
    rate: {
      // Prisma の Decimal とは別インスタンスなので文字列経由で渡す。
      low: new Decimal(cell.lowPercent.toString()),
      high: new Decimal(cell.highPercent.toString()),
      raw: cell.raw,
      valid: cell.isValid,
    },
  };
}

export type DatasetStats = {
  generatedAt: string | null;
  sheets: number;
  stations: number;
  localities: number;
  blockers: number;
  warnings: number;
};

/** 管理画面の稼働確認用。基準データが入っているかを一目で見られるようにする。 */
export async function datasetStats(): Promise<DatasetStats> {
  const [latest, sheets, stations, localities, blockers, warnings] =
    await Promise.all([
      prisma.yieldSheet.findFirst({
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true },
      }),
      prisma.yieldSheet.count(),
      prisma.station.count(),
      prisma.municipality.count(),
      prisma.dataIssue.count({ where: { level: "BLOCKER" } }),
      prisma.dataIssue.count({ where: { level: "WARNING" } }),
    ]);

  return {
    generatedAt: latest?.generatedAt.toISOString() ?? null,
    sheets,
    stations,
    localities,
    blockers,
    warnings,
  };
}
