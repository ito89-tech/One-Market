/**
 * Shared yield-master load / replace helpers.
 * Used by prisma/seed.ts (tsx, no @/ aliases) and by the admin API via a thin re-export.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

export type RateCell = {
  low: number;
  high: number;
  raw: string;
  valid: boolean;
};

export type YieldMasterSheet = {
  key: string;
  name: string;
  prefectures: string[];
  isFallback: boolean;
  areaCodes: string[];
  defaultArea: string;
  rates: Array<{
    label: string;
    ageMin: number;
    ageMax: number | null;
    byArea: Record<string, RateCell>;
  }>;
  stations: Array<{ name: string; key: string; area: string; column: number }>;
  localities: Array<{
    name: string;
    key: string;
    kind: string;
    area: string;
    column: number;
  }>;
};

export type YieldMaster = {
  source: string;
  generatedAt: string;
  sheets: YieldMasterSheet[];
  issues: Array<{ level: string; sheet: string; code: string; message: string }>;
};

export type YieldMasterStats = {
  sheets: number;
  areas: number;
  stations: number;
  municipalities: number;
  ageBrackets: number;
  yieldRates: number;
  issues: number;
  source: string | null;
  generatedAt: string | null;
};

export function defaultMasterPath(cwd = process.cwd()): string {
  const preferred = path.join(cwd, "data", "yield-master.json");
  if (existsSync(preferred)) return preferred;
  return path.join(cwd, "..", "data", "yield-master.json");
}

export function loadYieldMasterFromBuffer(buf: Buffer | string): YieldMaster {
  const text = typeof buf === "string" ? buf : buf.toString("utf-8");
  const parsed = JSON.parse(text) as unknown;
  return assertYieldMaster(parsed);
}

export function loadYieldMasterFromFile(filePath?: string): YieldMaster {
  const resolved = filePath ?? defaultMasterPath();
  if (!existsSync(resolved)) {
    throw new Error(`利回りマスタ JSON が見つかりません: ${resolved}`);
  }
  return loadYieldMasterFromBuffer(readFileSync(resolved));
}

function assertYieldMaster(value: unknown): YieldMaster {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("利回りマスタ JSON の形式が不正です");
  }
  const master = value as Partial<YieldMaster>;
  if (!Array.isArray(master.sheets) || !Array.isArray(master.issues)) {
    throw new Error(
      "利回りマスタ JSON には sheets と issues 配列が必要です（tools/build_yield_dataset.py の出力をアップロードしてください）",
    );
  }
  if (typeof master.source !== "string" || typeof master.generatedAt !== "string") {
    throw new Error("利回りマスタ JSON に source / generatedAt がありません");
  }
  return master as YieldMaster;
}

/**
 * Replaces yield master tables only. Users, payments, and diagnoses are untouched.
 */
export async function replaceYieldMasterInDb(
  prisma: PrismaClient,
  master: YieldMaster,
): Promise<YieldMasterStats> {
  // Cascades clear Area / Station / Municipality / AgeBracket / YieldRate.
  await prisma.yieldSheet.deleteMany();
  await prisma.dataIssue.deleteMany();

  for (const sheet of master.sheets) {
    const createdSheet = await prisma.yieldSheet.create({
      data: {
        key: sheet.key,
        name: sheet.name,
        prefectures: sheet.prefectures,
        isFallback: sheet.isFallback,
        defaultArea: sheet.defaultArea,
        sourceFile: master.source,
        generatedAt: new Date(master.generatedAt),
      },
    });

    const areaIdByCode = new Map<string, string>();
    for (const [index, code] of sheet.areaCodes.entries()) {
      const area = await prisma.area.create({
        data: {
          sheetId: createdSheet.id,
          code,
          label: `${code}エリア`,
          sort: index,
        },
      });
      areaIdByCode.set(code, area.id);
    }

    const bracketIdByLabel = new Map<string, string>();
    for (const [index, row] of sheet.rates.entries()) {
      const bracket = await prisma.ageBracket.create({
        data: {
          sheetId: createdSheet.id,
          label: row.label,
          ageMin: row.ageMin,
          ageMax: row.ageMax,
          sort: index,
        },
      });
      bracketIdByLabel.set(row.label, bracket.id);
    }

    await prisma.station.createMany({
      data: sheet.stations.map((station) => ({
        sheetId: createdSheet.id,
        areaId: areaIdByCode.get(station.area)!,
        name: station.name,
        lookupKey: station.key,
        sourceColumn: station.column,
      })),
    });

    await prisma.municipality.createMany({
      data: sheet.localities.map((locality) => ({
        sheetId: createdSheet.id,
        areaId: areaIdByCode.get(locality.area)!,
        name: locality.name,
        lookupKey: locality.key,
        kind: locality.kind,
      })),
    });

    await prisma.yieldRate.createMany({
      data: sheet.rates.flatMap((row) =>
        Object.entries(row.byArea).map(([code, cell]) => ({
          sheetId: createdSheet.id,
          areaId: areaIdByCode.get(code)!,
          ageBracketId: bracketIdByLabel.get(row.label)!,
          lowPercent: cell.low,
          highPercent: cell.high,
          raw: cell.raw,
          isValid: cell.valid,
        })),
      ),
    });
  }

  await prisma.dataIssue.createMany({
    data: master.issues.map((issue) => ({
      level: issue.level,
      sheetName: issue.sheet,
      code: issue.code,
      message: issue.message,
    })),
  });

  return getYieldMasterStats(prisma);
}

export async function getYieldMasterStats(
  prisma: PrismaClient,
): Promise<YieldMasterStats> {
  const [sheets, areas, stations, municipalities, ageBrackets, yieldRates, issues, meta] =
    await Promise.all([
      prisma.yieldSheet.count(),
      prisma.area.count(),
      prisma.station.count(),
      prisma.municipality.count(),
      prisma.ageBracket.count(),
      prisma.yieldRate.count(),
      prisma.dataIssue.count(),
      prisma.yieldSheet.findFirst({
        orderBy: { generatedAt: "desc" },
        select: { sourceFile: true, generatedAt: true },
      }),
    ]);

  return {
    sheets,
    areas,
    stations,
    municipalities,
    ageBrackets,
    yieldRates,
    issues,
    source: meta?.sourceFile ?? null,
    generatedAt: meta?.generatedAt?.toISOString() ?? null,
  };
}
