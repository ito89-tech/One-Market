import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DIAGNOSIS_ENGINE_URL = "http://engine.test";

const { requestDiagnosis } = await import("@/lib/engine");

function respond(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const ENGINE_BODY = {
  result: {
    judgement: "OVERPRICED",
    marketPrice: { lowMan: 2400, highMan: 2500 },
    listedPriceMan: 2670,
    difference: { lowMan: 170, highMan: 270 },
  },
  internal: {
    sheetKey: "kanagawa",
    sheetName: "神奈川",
    areaCode: "1",
    matchedBy: "station",
    matchedValue: "横浜",
    ageBracketLabel: "0-5",
    yieldPercent: "3.500",
    rateLow: "3.20",
    rateHigh: "3.39",
    monthlyNetIncomeYen: "77920",
    annualNetIncomeYen: "935040",
  },
};

const PAYLOAD = {
  prefecture: "神奈川県",
  municipality: "横浜市西区",
  station: "横浜",
  walkMinutes: 5,
  buildingAge: 7,
  priceYen: 26_700_000,
  monthlyRentYen: 90_000,
  managementFeeYen: 7_820,
  repairReserveYen: 4_260,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("診断エンジンクライアント", () => {
  it("成功レスポンスを公開用と内部用に分けて返す", async () => {
    const fetchMock = respond(200, ENGINE_BODY);
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestDiagnosis(PAYLOAD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.judgement).toBe("OVERPRICED");
    expect(result.internal.yieldPercent).toBe("3.500");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://engine.test/diagnose",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("基準データ未登録は DATA_UNAVAILABLE として案内する", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, { error: { code: "DATA_UNAVAILABLE", message: "no data" } }),
    );

    const result = await requestDiagnosis(PAYLOAD);

    expect(result).toMatchObject({ ok: false, code: "DATA_UNAVAILABLE" });
    if (result.ok) return;
    // 内部のエラー文言をそのまま出さない
    expect(result.message).not.toContain("no data");
    expect(result.message).toContain("基準データ");
  });

  it("築年数が区分外のときも DATA_UNAVAILABLE として扱う", async () => {
    vi.stubGlobal(
      "fetch",
      respond(422, { error: { code: "AGE_OUT_OF_RANGE", message: "out of range" } }),
    );

    const result = await requestDiagnosis(PAYLOAD);
    expect(result).toMatchObject({ ok: false, code: "DATA_UNAVAILABLE" });
  });

  it("エンジンに到達できないときは ENGINE_UNAVAILABLE を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const result = await requestDiagnosis(PAYLOAD);
    expect(result).toMatchObject({ ok: false, code: "ENGINE_UNAVAILABLE" });
  });

  it("500 応答でも例外を投げずに失敗として返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", respond(500, {}));

    const result = await requestDiagnosis(PAYLOAD);
    expect(result).toMatchObject({ ok: false, code: "ENGINE_UNAVAILABLE" });
  });
});
