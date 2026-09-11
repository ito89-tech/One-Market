/**
 * 診断エンジン（プロセス内）。
 *
 * 以前は Python(FastAPI) を HTTP で呼んでいたが、Vercel では同一デプロイに
 * 常駐プロセスを置けないため TypeScript へ移植した。基準データは
 * PostgreSQL（シード済みの YieldSheet 系テーブル）だけを参照する。
 *
 * 公開用と内部用の数値を分けて返すのは従来どおり。内部の利回りはブラウザへ
 * 渡してはいけないので、呼び出し側で internal を落としてから応答する。
 */
import "server-only";

import { evaluatePrice, Decimal, DiagnosisError } from "@/server/engine/calc";
import {
  datasetStats,
  findYieldRate,
  resolveArea,
  resolveSheetForInput,
} from "@/server/engine/dataset";

export type { Judgement } from "@/server/engine/calc";

import type { Judgement } from "@/server/engine/calc";

export type EnginePublicResult = {
  judgement: Judgement;
  marketPrice: { lowMan: number; highMan: number };
  listedPriceMan: number;
  difference: { lowMan: number; highMan: number };
};

export type EngineInternalResult = {
  sheetKey: string;
  sheetName: string;
  areaCode: string;
  matchedBy: "station" | "locality" | "default";
  matchedValue: string | null;
  ageBracketLabel: string;
  yieldPercent: string;
  rateLow: string;
  rateHigh: string;
  monthlyNetIncomeYen: string;
  annualNetIncomeYen: string;
};

export type EngineRequest = {
  prefecture: string;
  municipality: string;
  station: string;
  walkMinutes: number;
  buildingAge: number;
  priceYen: number;
  monthlyRentYen: number;
  managementFeeYen: number;
  repairReserveYen: number;
};

export type EngineSuccess = {
  ok: true;
  result: EnginePublicResult;
  internal: EngineInternalResult;
};

export type EngineFailure = {
  ok: false;
  code: "DATA_UNAVAILABLE" | "ENGINE_UNAVAILABLE" | "VALIDATION_ERROR";
  message: string;
};

const DATA_UNAVAILABLE_MESSAGE =
  "この条件の基準データは現在ご用意がありません。恐れ入りますが条件を変えてお試しください。";

function toFailure(error: DiagnosisError): EngineFailure {
  switch (error.code) {
    case "DATA_UNAVAILABLE":
    case "AGE_OUT_OF_RANGE":
      return {
        ok: false,
        code: "DATA_UNAVAILABLE",
        message: DATA_UNAVAILABLE_MESSAGE,
      };
    default:
      // AMBIGUOUS_STATION / LOCATION_REQUIRED / INVALID_PRICE /
      // NON_POSITIVE_INCOME は、そのまま利用者に見せてよい文面にしてある。
      return { ok: false, code: "VALIDATION_ERROR", message: error.message };
  }
}

export async function requestDiagnosis(
  payload: EngineRequest,
): Promise<EngineSuccess | EngineFailure> {
  try {
    const sheet = await resolveSheetForInput({
      prefecture: payload.prefecture,
      station: payload.station,
      municipality: payload.municipality,
    });

    const area = await resolveArea(sheet, payload.station, payload.municipality);
    const { ageBracketLabel, rate } = await findYieldRate(
      sheet,
      area.areaCode,
      payload.buildingAge,
    );

    const band = evaluatePrice(
      {
        walkMinutes: payload.walkMinutes,
        buildingAge: payload.buildingAge,
        priceYen: new Decimal(payload.priceYen),
        monthlyRentYen: new Decimal(payload.monthlyRentYen),
        managementFeeYen: new Decimal(payload.managementFeeYen),
        repairReserveYen: new Decimal(payload.repairReserveYen),
      },
      area.areaCode,
      rate,
    );

    return {
      ok: true,
      result: {
        judgement: band.judgement,
        marketPrice: {
          lowMan: band.marketPriceLowMan,
          highMan: band.marketPriceHighMan,
        },
        listedPriceMan: band.listedPriceMan,
        difference: {
          lowMan: band.differenceLowMan,
          highMan: band.differenceHighMan,
        },
      },
      internal: {
        sheetKey: sheet.key,
        sheetName: sheet.name,
        areaCode: area.areaCode,
        matchedBy: area.matchedBy,
        matchedValue: area.matchedValue,
        ageBracketLabel,
        yieldPercent: band.yieldPercent.toFixed(4),
        rateLow: band.rateLow.toFixed(2),
        rateHigh: band.rateHigh.toFixed(2),
        monthlyNetIncomeYen: band.monthlyNetIncomeYen.toFixed(0),
        annualNetIncomeYen: band.annualNetIncomeYen.toFixed(0),
      },
    };
  } catch (error) {
    if (error instanceof DiagnosisError) {
      return toFailure(error);
    }
    // ここに来るのはデータベース障害など想定外の事象だけ。
    console.error("[engine] failed", error);
    return {
      ok: false,
      code: "ENGINE_UNAVAILABLE",
      message:
        "診断サービスが一時的に利用できません。時間をおいて再度お試しください。",
    };
  }
}

/** 管理画面の稼働確認。基準データが投入済みかどうかを返す。 */
export async function engineHealth(): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false }
> {
  try {
    const stats = await datasetStats();
    // シートが無い＝シード未実行。接続できても診断はできないので異常扱いにする。
    if (stats.sheets === 0) return { ok: false };
    return { ok: true, data: { status: "ok", ...stats } };
  } catch {
    return { ok: false };
  }
}
