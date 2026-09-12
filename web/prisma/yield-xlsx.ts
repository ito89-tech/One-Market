/**
 * クライアント提供の利回りシート.xlsx を読み、PostgreSQL 投入用の構造に変換する。
 * tools/build_yield_dataset.py と同じ列レイアウト・検証ルールを TypeScript で実装。
 * 実行時の正本は JSON ではなく、この変換結果を DB に書いたあとの PostgreSQL。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import type { YieldMaster, YieldMasterSheet } from "./yield-master-lib";

type AreaSpec = {
  station_cols?: number[];
  locality_cols?: number[];
  mixed_cols?: number[];
};

type SheetLayout = {
  key: string;
  prefectures: string[];
  fallback: boolean;
  rate_cols: Record<string, number>;
  areas: Record<string, AreaSpec>;
  default_area: string;
};

const TEMPLATE_SHEET = "雛形";

const SHEET_LAYOUT: Record<string, SheetLayout> = {
  "東京・埼玉・神奈川・千葉": {
    key: "kanto",
    prefectures: ["東京都", "埼玉県", "神奈川県", "千葉県"],
    fallback: false,
    rate_cols: { "1": 1, "2": 2, "3": 3, "4": 4 },
    areas: {
      "1": { station_cols: [6, 7, 8, 9, 10, 11, 12], locality_cols: [] },
      "2": { station_cols: [14], locality_cols: [15] },
      "3": { station_cols: [], locality_cols: [17] },
      "4": { station_cols: [], locality_cols: [] },
    },
    default_area: "4",
  },
  "大阪・京都・兵庫": {
    key: "kansai",
    prefectures: ["大阪府", "京都府", "兵庫県"],
    fallback: false,
    rate_cols: { "1": 1, "2": 2, "3": 3, "4": 4 },
    areas: {
      "1": { station_cols: [6], locality_cols: [] },
      "2": { station_cols: [], locality_cols: [], mixed_cols: [8] },
      "3": { station_cols: [], locality_cols: [], mixed_cols: [10] },
      "4": { station_cols: [], locality_cols: [] },
    },
    default_area: "4",
  },
  福岡: {
    key: "fukuoka",
    prefectures: ["福岡県"],
    fallback: false,
    rate_cols: { "1": 1, "2": 2, "3": 3 },
    areas: {
      "1": { station_cols: [5], locality_cols: [] },
      "2": { station_cols: [7], locality_cols: [] },
      "3": { station_cols: [], locality_cols: [] },
    },
    default_area: "3",
  },
  "愛知・その他": {
    key: "aichi_other",
    prefectures: ["愛知県"],
    fallback: true,
    rate_cols: { "1": 1, "2": 2, "3": 3 },
    areas: {
      "1": { station_cols: [5], locality_cols: [] },
      "2": { station_cols: [7], locality_cols: [] },
      "3": { station_cols: [], locality_cols: [] },
    },
    default_area: "3",
  },
};

const RATE_RE = /^(\d+(?:\.\d+)?)%\s*[-–~〜]\s*(\d+(?:\.\d+)?)%$/;
const AGE_EXACT_RE = /^(\d+)$/;
const AGE_FLOAT_RE = /^(\d+)\.0+$/;
const AGE_RANGE_RE = /^(\d+)\s*[~〜-]\s*(\d+)$/;
const AGE_OPEN_RE = /^(\d+)以上$/;

type Issue = {
  level: string;
  sheet: string;
  code: string;
  message: string;
};

function normaliseCommon(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

function stationKey(value: string): string {
  let text = normaliseCommon(value);
  if (text.length > 1 && text.endsWith("駅")) text = text.slice(0, -1);
  return text.replace(/[・･]/g, "").replace(/[ヶヵ]/g, "ケ");
}

function localityKey(value: string): string {
  return normaliseCommon(value);
}

function localityKind(value: string): string {
  const text = normaliseCommon(value);
  if (text.endsWith("区")) return "ward";
  if (text.endsWith("市")) return "city";
  if (text.endsWith("町") || text.endsWith("村")) return "town";
  return "other";
}

function canonicalAgeLabel(label: string): string {
  const text = normaliseCommon(label);
  const m = AGE_FLOAT_RE.exec(text);
  return m ? m[1] : label.trim();
}

function parseAge(label: string): [number, number | null] | null {
  const text = normaliseCommon(label);
  let m = AGE_FLOAT_RE.exec(text);
  if (m) {
    const value = Number(m[1]);
    return [value, value];
  }
  m = AGE_RANGE_RE.exec(text);
  if (m) return [Number(m[1]), Number(m[2])];
  m = AGE_OPEN_RE.exec(text);
  if (m) return [Number(m[1]), null];
  m = AGE_EXACT_RE.exec(text);
  if (m) {
    const value = Number(m[1]);
    return [value, value];
  }
  return null;
}

function parseRate(raw: string): [number, number] | null {
  const m = RATE_RE.exec(normaliseCommon(raw));
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function at(row: string[], idx: number): string {
  return idx < row.length ? row[idx] : "";
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const rich = value as { text?: string; richText?: Array<{ text: string }> };
    if (typeof rich.text === "string") return rich.text.trim();
    if (Array.isArray(rich.richText)) {
      return rich.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value && value.result != null) {
      return String(value.result).trim();
    }
  }
  return String(value).trim();
}

async function readXlsxSheets(
  input: string | Buffer,
): Promise<Record<string, string[][]>> {
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(input)) {
    // ExcelJS typings expect ArrayBuffer; Node Buffer is fine at runtime.
    await workbook.xlsx.load(input as unknown as ArrayBuffer);
  } else {
    await workbook.xlsx.readFile(input);
  }

  const sheets: Record<string, string[][]> = {};
  for (const worksheet of workbook.worksheets) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as Array<ExcelJS.CellValue | undefined>;
      // ExcelJS is 1-indexed; index 0 is unused.
      const line: string[] = [];
      for (let i = 1; i < values.length; i += 1) {
        line.push(cellToText(values[i] ?? null));
      }
      while (line.length > 0 && line[line.length - 1] === "") line.pop();
      rows.push(line);
    });
    while (rows.length > 0 && !rows[rows.length - 1].some(Boolean)) {
      rows.pop();
    }
    sheets[worksheet.name] = rows;
  }
  return sheets;
}

export function defaultXlsxPath(cwd = process.cwd()): string {
  const bundled = path.join(cwd, "data", "yield-sheet.xlsx");
  if (existsSync(bundled)) return bundled;
  return path.join(cwd, "..", "data", "yield-sheet.xlsx");
}

export async function buildYieldMasterFromXlsx(
  source: string | Buffer,
  sourceLabel?: string,
): Promise<YieldMaster> {
  const issues: Issue[] = [];
  const issue = (
    level: string,
    sheet: string,
    code: string,
    message: string,
  ) => {
    issues.push({ level, sheet, code, message });
  };

  const rawSheets = await readXlsxSheets(source);
  const label =
    sourceLabel ??
    (typeof source === "string" ? path.basename(source) : "upload.xlsx");

  for (const name of Object.keys(rawSheets)) {
    if (name !== TEMPLATE_SHEET && !(name in SHEET_LAYOUT)) {
      issue(
        "BLOCKER",
        name,
        "UNKNOWN_SHEET",
        "利回りシートに未知のシートがあります。列構成を確認するまで取り込めません。",
      );
    }
  }
  for (const name of Object.keys(SHEET_LAYOUT)) {
    if (!(name in rawSheets)) {
      issue("BLOCKER", name, "MISSING_SHEET", "想定していたシートが見つかりません。");
    }
  }

  const sheetsOut: YieldMasterSheet[] = [];
  const stationIndex = new Map<string, Array<[string, string]>>();
  const localityIndex = new Map<string, Array<[string, string]>>();

  for (const [sheetName, layout] of Object.entries(SHEET_LAYOUT)) {
    const rows = rawSheets[sheetName];
    if (!rows) continue;

    const areaCodes = Object.keys(layout.rate_cols);
    const rates: YieldMasterSheet["rates"] = [];
    const seenAges = new Set<string>();

    for (let rIdx = 2; rIdx < rows.length; rIdx += 1) {
      const rawLabel = at(rows[rIdx], 0);
      if (!rawLabel) continue;
      const ageLabel = canonicalAgeLabel(rawLabel);
      const age = parseAge(rawLabel);
      if (!age) {
        issue(
          "BLOCKER",
          sheetName,
          "BAD_AGE_LABEL",
          `築年数の表記「${ageLabel}」を解釈できません。`,
        );
        continue;
      }
      const ageKey = `${age[0]}:${age[1] ?? "open"}`;
      if (seenAges.has(ageKey)) {
        issue(
          "WARNING",
          sheetName,
          "DUPLICATE_AGE",
          `築年数「${ageLabel}」が重複しています。`,
        );
      }
      seenAges.add(ageKey);

      const byArea: YieldMasterSheet["rates"][number]["byArea"] = {};
      for (const code of areaCodes) {
        const raw = at(rows[rIdx], layout.rate_cols[code]);
        if (!raw) {
          issue(
            "BLOCKER",
            sheetName,
            "MISSING_RATE",
            `築年数「${ageLabel}」・${code}エリアの収益率が空欄です。`,
          );
          continue;
        }
        const parsed = parseRate(raw);
        if (!parsed) {
          issue(
            "BLOCKER",
            sheetName,
            "BAD_RATE_FORMAT",
            `築年数「${ageLabel}」・${code}エリアの収益率「${raw}」を解釈できません。`,
          );
          continue;
        }
        const [low, high] = parsed;
        const valid = low <= high;
        if (!valid) {
          issue(
            "BLOCKER",
            sheetName,
            "INVERTED_RATE_RANGE",
            `築年数「${ageLabel}」・${code}エリアの収益率「${raw}」は下限が上限を上回っています。正しい値をクライアントに確認するまで診断できません。`,
          );
        }
        byArea[code] = { low, high, raw, valid };
      }

      rates.push({
        label: ageLabel,
        ageMin: age[0],
        ageMax: age[1],
        byArea,
      });
    }

    const stations: YieldMasterSheet["stations"] = [];
    const localities: YieldMasterSheet["localities"] = [];
    const seenStation = new Map<string, string>();
    const seenLocality = new Map<string, string>();

    const addStation = (name: string, area: string, column: number) => {
      const key = stationKey(name);
      if (!key) return;
      if (seenStation.has(key)) {
        const previous = seenStation.get(key)!;
        issue(
          previous === area ? "WARNING" : "BLOCKER",
          sheetName,
          "DUPLICATE_STATION",
          `駅名「${name}」が同一シート内で重複しています（${previous}エリア / ${area}エリア）。`,
        );
        if (previous === area) return;
      }
      seenStation.set(key, area);
      stations.push({ name, key, area, column });
      const hits = stationIndex.get(key) ?? [];
      hits.push([sheetName, area]);
      stationIndex.set(key, hits);
    };

    const addLocality = (name: string, area: string, column: number) => {
      const key = localityKey(name);
      if (!key) return;
      if (seenLocality.has(key)) {
        const previous = seenLocality.get(key)!;
        issue(
          previous === area ? "WARNING" : "BLOCKER",
          sheetName,
          "DUPLICATE_LOCALITY",
          `市区町村「${name}」が同一シート内で重複しています（${previous}エリア / ${area}エリア）。`,
        );
        if (previous === area) return;
      }
      seenLocality.set(key, area);
      localities.push({
        name,
        key,
        kind: localityKind(name),
        area,
        column,
      });
      const hits = localityIndex.get(key) ?? [];
      hits.push([sheetName, area]);
      localityIndex.set(key, hits);
    };

    for (const [areaCode, spec] of Object.entries(layout.areas)) {
      for (const col of spec.station_cols ?? []) {
        for (const row of rows.slice(2)) {
          const value = at(row, col);
          if (value) addStation(value, areaCode, col);
        }
      }
      for (const col of spec.locality_cols ?? []) {
        for (const row of rows.slice(2)) {
          const value = at(row, col);
          if (value) addLocality(value, areaCode, col);
        }
      }
      for (const col of spec.mixed_cols ?? []) {
        issue(
          "WARNING",
          sheetName,
          "MIXED_STATION_LOCALITY_COLUMN",
          `${areaCode}エリアの列(列${col})に市区町村名と駅名が混在しています（見出しが無い、または見出しと中身が一致しない）。接尾辞（区/市/町/村）で自動判別しています。要確認。`,
        );
        for (const row of rows.slice(2)) {
          const value = at(row, col);
          if (!value) continue;
          if (["ward", "city", "town"].includes(localityKind(value))) {
            addLocality(value, areaCode, col);
          } else {
            addStation(value, areaCode, col);
          }
        }
      }
    }

    sheetsOut.push({
      key: layout.key,
      name: sheetName,
      prefectures: layout.prefectures,
      isFallback: layout.fallback,
      areaCodes,
      defaultArea: layout.default_area,
      rates,
      stations,
      localities,
    });
  }

  for (const [key, hits] of stationIndex) {
    const sheetNames = new Set(hits.map(([sheet]) => sheet));
    if (sheetNames.size > 1) {
      issue(
        "WARNING",
        "-",
        "CROSS_SHEET_STATION",
        `駅名「${key}」が複数シートに存在します（${hits.map(([s, a]) => `${s}:${a}`).join("、")}）。都道府県の指定で判別します。`,
      );
    }
  }
  for (const [key, hits] of localityIndex) {
    const sheetNames = new Set(hits.map(([sheet]) => sheet));
    if (sheetNames.size > 1) {
      issue(
        "WARNING",
        "-",
        "CROSS_SHEET_LOCALITY",
        `市区町村「${key}」が複数シートに存在します（${hits.map(([s, a]) => `${s}:${a}`).join("、")}）。都道府県の指定で判別します。`,
      );
    }
  }

  for (const key of [...stationIndex.keys()].filter((name) =>
    localityIndex.has(name),
  )) {
    issue(
      "WARNING",
      "-",
      "STATION_LOCALITY_SAME_NAME",
      `「${key}」が駅名としても市区町村名としても登録されています。駅名を優先します。`,
    );
  }

  const fallbackSheets = sheetsOut.filter((sheet) => sheet.isFallback);
  if (fallbackSheets.length !== 1) {
    issue(
      "BLOCKER",
      "-",
      "FALLBACK_SHEET_COUNT",
      "記載外の都道府県に適用するシートが一意に決まりません。",
    );
  }

  return {
    source: label,
    generatedAt: new Date().toISOString(),
    sheets: sheetsOut,
    issues,
  };
}

export async function buildYieldMasterFromXlsxFile(
  filePath?: string,
): Promise<YieldMaster> {
  const resolved = filePath ?? defaultXlsxPath();
  if (!existsSync(resolved)) {
    throw new Error(`利回りシート xlsx が見つかりません: ${resolved}`);
  }
  return buildYieldMasterFromXlsx(readFileSync(resolved), path.basename(resolved));
}
