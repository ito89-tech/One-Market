/**
 * data/yield-master.json だけを入力に、診断エンジンが実際に投げるクエリ形だけを
 * 再現する最小の Prisma 代替。
 *
 * 目的は「移植したエンジンが本物の基準データで Python 版と同じ答えを出す」ことを
 * データベース無しで確かめること。ここで実装しているのは
 * src/server/engine/dataset.ts が使うクエリに限る。汎用の Prisma 模倣ではない。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import Decimal from "decimal.js";

type RateCell = { low: number; high: number; raw: string; valid: boolean };

type MasterSheet = {
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
  stations: Array<{ name: string; key: string; area: string }>;
  localities: Array<{ name: string; key: string; kind: string; area: string }>;
};

type Master = {
  generatedAt: string;
  sheets: MasterSheet[];
  issues: Array<{ level: string; sheet: string; code: string; message: string }>;
};

const MASTER_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "data",
  "yield-master.json",
);

export const master: Master = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));

/** シートの id は key と同じ値にしておく（テスト内で追跡しやすくするため）。 */
function sheetById(sheetId: string): MasterSheet | undefined {
  return master.sheets.find((sheet) => sheet.key === sheetId);
}

function sheetRow(sheet: MasterSheet) {
  return {
    id: sheet.key,
    key: sheet.key,
    name: sheet.name,
    prefectures: sheet.prefectures,
    isFallback: sheet.isFallback,
    defaultArea: sheet.defaultArea,
  };
}

function decimal(value: number): Decimal {
  // 浮動小数の見た目をそのまま渡す。String() は最短往復表現になるので
  // 3.2 → "3.2" のように元データと一致する。
  return new Decimal(String(value));
}

export const masterPrisma = {
  yieldSheet: {
    findMany: async () => master.sheets.map(sheetRow),
    findFirst: async (args?: { where?: { isFallback?: boolean } }) => {
      if (args?.where?.isFallback) {
        const hit = master.sheets.find((sheet) => sheet.isFallback);
        return hit ? sheetRow(hit) : null;
      }
      return { generatedAt: new Date(master.generatedAt) };
    },
    count: async () => master.sheets.length,
  },

  station: {
    findMany: async (args: { where: { lookupKey: string } }) => {
      const rows: Array<{
        area: { code: string };
        sheet: ReturnType<typeof sheetRow>;
      }> = [];
      for (const sheet of master.sheets) {
        for (const station of sheet.stations) {
          if (station.key !== args.where.lookupKey) continue;
          rows.push({ area: { code: station.area }, sheet: sheetRow(sheet) });
        }
      }
      return rows;
    },

    findUnique: async (args: {
      where: { sheetId_lookupKey: { sheetId: string; lookupKey: string } };
    }) => {
      const { sheetId, lookupKey } = args.where.sheetId_lookupKey;
      const sheet = sheetById(sheetId);
      const hit = sheet?.stations.find((station) => station.key === lookupKey);
      return hit ? { area: { code: hit.area } } : null;
    },

    count: async () =>
      master.sheets.reduce((total, sheet) => total + sheet.stations.length, 0),
  },

  municipality: {
    findMany: async (args: {
      where: { sheetId: string; lookupKey: string };
    }) => {
      const sheet = sheetById(args.where.sheetId);
      if (!sheet) return [];
      return sheet.localities
        .filter((locality) => locality.key === args.where.lookupKey)
        .map((locality) => ({
          kind: locality.kind,
          area: { code: locality.area },
        }));
    },

    count: async () =>
      master.sheets.reduce((total, sheet) => total + sheet.localities.length, 0),
  },

  ageBracket: {
    findFirst: async (args: {
      where: {
        sheetId: string;
        ageMin: { lte: number };
        OR: unknown;
      };
      select: { yieldRates: { where: { area: { code: string } } } };
    }) => {
      const sheet = sheetById(args.where.sheetId);
      if (!sheet) return null;

      const age = args.where.ageMin.lte;
      // rates の配列順が seed の sort 順。orderBy: { sort: "asc" } と同じ。
      const row = sheet.rates.find(
        (rate) =>
          rate.ageMin <= age && (rate.ageMax === null || rate.ageMax >= age),
      );
      if (!row) return null;

      const areaCode = args.select.yieldRates.where.area.code;
      const cell = row.byArea[areaCode];

      return {
        label: row.label,
        yieldRates: cell
          ? [
              {
                lowPercent: decimal(cell.low),
                highPercent: decimal(cell.high),
                raw: cell.raw,
                isValid: cell.valid,
              },
            ]
          : [],
      };
    },
  },

  dataIssue: {
    count: async (args?: { where?: { level?: string } }) =>
      master.issues.filter(
        (issue) => !args?.where?.level || issue.level === args.where.level,
      ).length,
  },
};
