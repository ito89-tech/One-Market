/**
 * Client for the Python diagnosis engine.
 *
 * The engine returns both public and internal figures; splitting them here
 * keeps the internal yield out of anything a browser can see.
 */
import "server-only";

import { serverEnv } from "./env";

export type Judgement = "UNDERPRICED" | "FAIR" | "OVERPRICED";

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

const TIMEOUT_MS = 8000;

export async function requestDiagnosis(
  payload: EngineRequest,
): Promise<EngineSuccess | EngineFailure> {
  let response: Response;
  try {
    response = await fetch(`${serverEnv.engineUrl()}/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[engine] unreachable", error);
    return {
      ok: false,
      code: "ENGINE_UNAVAILABLE",
      message: "診断サービスに接続できませんでした。時間をおいて再度お試しください。",
    };
  }

  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    const code = body?.error?.code;
    if (code === "DATA_UNAVAILABLE" || code === "AGE_OUT_OF_RANGE") {
      return {
        ok: false,
        code: "DATA_UNAVAILABLE",
        message:
          "この条件の基準データは現在ご用意がありません。恐れ入りますが条件を変えてお試しください。",
      };
    }
    if (code === "AMBIGUOUS_STATION" || code === "LOCATION_REQUIRED") {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: body?.error?.message ?? "所在地をご確認ください。",
      };
    }
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: body?.error?.message ?? "入力内容をご確認ください。",
    };
  }

  if (!response.ok) {
    console.error("[engine] unexpected status", response.status);
    return {
      ok: false,
      code: "ENGINE_UNAVAILABLE",
      message: "診断サービスが一時的に利用できません。時間をおいて再度お試しください。",
    };
  }

  const body = (await response.json()) as {
    result: EnginePublicResult;
    internal: EngineInternalResult;
  };
  return { ok: true, result: body.result, internal: body.internal };
}

export async function engineHealth(): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false }
> {
  try {
    const response = await fetch(`${serverEnv.engineUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}
