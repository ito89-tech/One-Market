/**
 * 移植した診断エンジンを、本物の基準データ（data/yield-master.json）に対して
 * 検証する。engine/tests/test_diagnosis.py のデータ依存ケースを移植したもので、
 * Python 版と同じ答えを返すことがこのファイルの目的。
 */
import { describe, expect, it, vi } from "vitest";

import { master, masterPrisma } from "./helpers/master-db";

vi.mock("@/lib/prisma", () => ({ prisma: masterPrisma }));

const { requestDiagnosis } = await import("@/lib/engine");
const {
  findYieldRate,
  loadSheets,
  resolveArea,
  resolveSheetByPrefecture,
  resolveSheetForInput,
} = await import("@/server/engine/dataset");

const sheets = await loadSheets();
const sheetOf = (key: string) => {
  const sheet = sheets.find((candidate) => candidate.key === key);
  if (!sheet) throw new Error(`シートが見つかりません: ${key}`);
  return sheet;
};

const kanto = sheetOf("kanto");
const kansai = sheetOf("kansai");

/** 指示書 §4 の数値例をベースにした診断リクエスト。 */
function request(overrides: Partial<Parameters<typeof requestDiagnosis>[0]> = {}) {
  return {
    prefecture: "東京都",
    municipality: "渋谷区",
    station: "渋谷",
    walkMinutes: 5,
    buildingAge: 7,
    priceYen: 26_700_000,
    monthlyRentYen: 90_000,
    managementFeeYen: 7_820,
    repairReserveYen: 4_260,
    ...overrides,
  };
}

describe("シート選択", () => {
  it.each([
    ["東京都", "kanto"],
    ["神奈川県", "kanto"],
    ["埼玉県", "kanto"],
    ["千葉県", "kanto"],
    ["大阪府", "kansai"],
    ["京都府", "kansai"],
    ["兵庫県", "kansai"],
    ["福岡県", "fukuoka"],
    ["愛知県", "aichi_other"],
    // シートに記載の無い都道府県は「愛知・その他」に統一する
    ["広島県", "aichi_other"],
    ["岐阜県", "aichi_other"],
    ["北海道", "aichi_other"],
  ])("%s は %s シート", (prefecture, expected) => {
    expect(resolveSheetByPrefecture(sheets, prefecture).key).toBe(expected);
  });
});

describe("エリア判定: 駅名 → 市区町村 の優先順位", () => {
  it.each([
    // 駅名が最優先。横浜市(③)ではなく横浜駅(①)。
    ["横浜", "横浜市", "1", "station"],
    ["横浜駅", "横浜市", "1", "station"],
    // 武蔵小杉駅(②) は 川崎市(③) に優先する。
    ["武蔵小杉", "川崎市", "2", "station"],
    ["川崎", "川崎市", "2", "station"],
    // 駅が未登録なら市区町村で判定する。
    ["", "横浜市", "3", "locality"],
    ["", "川崎市", "3", "locality"],
    // 未登録の駅名はあいまい一致せず市区町村へフォールバックする。
    ["架空ヶ丘", "横浜市", "3", "locality"],
    ["架空ヶ丘", "渋谷区", "2", "locality"],
    // どちらも未登録なら「それ以外」。
    ["架空ヶ丘", "架空市", "4", "default"],
  ])(
    "駅=%s 市区町村=%s はエリア%s（%s 一致）",
    async (station, municipality, areaCode, matchedBy) => {
      const match = await resolveArea(kanto, station, municipality);
      expect(match.areaCode).toBe(areaCode);
      expect(match.matchedBy).toBe(matchedBy);
    },
  );

  it("「横浜」(駅) と「横浜市」(市) を同一視しない", async () => {
    await expect(resolveArea(kanto, "横浜市", "")).resolves.toMatchObject({
      matchedBy: "default",
    });
    await expect(resolveArea(kanto, "横浜", "")).resolves.toMatchObject({
      areaCode: "1",
    });
  });

  it("大阪市(②) より 淀川区(③) を優先する", async () => {
    await expect(resolveArea(kansai, "", "淀川区")).resolves.toMatchObject({
      areaCode: "3",
    });
    await expect(resolveArea(kansai, "", "大阪市")).resolves.toMatchObject({
      areaCode: "2",
    });
  });
});

describe("築年数区分と利回りレンジ", () => {
  it.each([
    [0, "0~1"],
    [1, "0~1"],
    [2, "2"],
    [34, "34"],
    [35, "35以上"],
    [60, "35以上"],
  ])("築%d年は区分「%s」", async (age, label) => {
    const found = await findYieldRate(kanto, "1", age);
    expect(found.ageBracketLabel).toBe(label);
  });

  it("東京①・築7年は指示書 §11 の 3.20%-3.39% と一致する", async () => {
    const { ageBracketLabel, rate } = await findYieldRate(kanto, "1", 7);
    expect(ageBracketLabel).toBe("7");
    expect([rate.low.toFixed(2), rate.high.toFixed(2)]).toEqual([
      "3.20",
      "3.39",
    ]);
  });

  it("東京④・築35年以上は 4.70%-4.89% で有効", async () => {
    const { ageBracketLabel, rate } = await findYieldRate(kanto, "4", 35);
    expect(ageBracketLabel).toBe("35以上");
    expect(rate.valid).toBe(true);
    expect([rate.low.toFixed(2), rate.high.toFixed(2)]).toEqual([
      "4.70",
      "4.89",
    ]);
  });

  it("不正なセルは値を直さず DATA_UNAVAILABLE にする", async () => {
    const spy = vi
      .spyOn(masterPrisma.ageBracket, "findFirst")
      .mockResolvedValue({
        label: "35以上",
        yieldRates: [
          {
            lowPercent: "4.70",
            highPercent: "4.49",
            raw: "4.70%-4.49%",
            isValid: false,
          },
        ],
      } as never);

    await expect(findYieldRate(kanto, "4", 35)).rejects.toMatchObject({
      code: "DATA_UNAVAILABLE",
    });

    spy.mockRestore();
  });
});

describe("駅名によるシート決定", () => {
  it("一意に決まる駅は都道府県を要求しない", async () => {
    const sheet = await resolveSheetForInput({
      prefecture: "",
      station: "横浜駅",
      municipality: "",
    });
    expect(sheet.key).toBe("kanto");
  });

  it("同名駅が複数地域にある場合は都道府県を要求する", async () => {
    await expect(
      resolveSheetForInput({ prefecture: "", station: "赤坂", municipality: "" }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_STATION" });

    await expect(
      resolveSheetForInput({
        prefecture: "東京都",
        station: "赤坂",
        municipality: "",
      }),
    ).resolves.toMatchObject({ key: "kanto" });

    await expect(
      resolveSheetForInput({
        prefecture: "福岡県",
        station: "赤坂",
        municipality: "",
      }),
    ).resolves.toMatchObject({ key: "fukuoka" });
  });

  it("「京橋」は都道府県でエリアが分かれる", async () => {
    await expect(resolveArea(kanto, "京橋", "")).resolves.toMatchObject({
      areaCode: "1",
    });
    await expect(resolveArea(kansai, "京橋", "")).resolves.toMatchObject({
      areaCode: "2",
    });
  });

  it("未登録の駅は都道府県と市区町村を要求する", async () => {
    await expect(
      resolveSheetForInput({
        prefecture: "",
        station: "架空ヶ丘",
        municipality: "",
      }),
    ).rejects.toMatchObject({ code: "LOCATION_REQUIRED" });
  });
});

describe("通しの診断", () => {
  it("指示書 §4 の例（渋谷駅・築7年・2,670万円）は割安", async () => {
    const result = await requestDiagnosis(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result).toEqual({
      judgement: "UNDERPRICED",
      marketPrice: { lowMan: 2758, highMan: 2922 },
      listedPriceMan: 2670,
      difference: { lowMan: 2758 - 2670, highMan: 2922 - 2670 },
    });
    expect(result.internal).toMatchObject({
      sheetKey: "kanto",
      areaCode: "1",
      matchedBy: "station",
      ageBracketLabel: "7",
      rateLow: "3.20",
      rateHigh: "3.39",
      monthlyNetIncomeYen: "77920",
      annualNetIncomeYen: "935040",
    });
  });

  it("①エリアは徒歩10分でも表のレンジのまま", async () => {
    const result = await requestDiagnosis(
      request({
        prefecture: "",
        municipality: "",
        station: "代々木駅",
        walkMinutes: 10,
        buildingAge: 2,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.internal.areaCode).toBe("1");
    expect([result.internal.rateLow, result.internal.rateHigh]).toEqual([
      "3.20",
      "3.29",
    ]);
  });

  it("②エリアは徒歩10分から +0.10% される", async () => {
    const common = {
      prefecture: "",
      municipality: "",
      station: "蒲田駅",
      buildingAge: 2,
    };
    const [nine, ten, eleven] = await Promise.all([
      requestDiagnosis(request({ ...common, walkMinutes: 9 })),
      requestDiagnosis(request({ ...common, walkMinutes: 10 })),
      requestDiagnosis(request({ ...common, walkMinutes: 11 })),
    ]);

    for (const result of [nine, ten, eleven]) {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.internal.areaCode).toBe("2");
    }
    if (!nine.ok || !ten.ok || !eleven.ok) return;

    expect([nine.internal.rateLow, nine.internal.rateHigh]).toEqual([
      "3.30",
      "3.39",
    ]);
    expect([ten.internal.rateLow, ten.internal.rateHigh]).toEqual([
      "3.40",
      "3.49",
    ]);
    expect([eleven.internal.rateLow, eleven.internal.rateHigh]).toEqual([
      "3.40",
      "3.49",
    ]);
  });

  it("③エリアも徒歩10分で補正される", async () => {
    const result = await requestDiagnosis(
      request({
        station: "架空ヶ丘",
        municipality: "横浜市",
        walkMinutes: 10,
        buildingAge: 2,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.internal.areaCode).toBe("3");
    expect([result.internal.rateLow, result.internal.rateHigh]).toEqual([
      "3.70",
      "3.79",
    ]);
  });

  it("同名駅は入力不備として利用者に返す", async () => {
    const result = await requestDiagnosis(
      request({ prefecture: "", municipality: "", station: "赤坂" }),
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    if (result.ok) return;
    expect(result.message).toContain("都道府県");
  });

  it("未登録の駅は所在地の入力を求める", async () => {
    const result = await requestDiagnosis(
      request({ prefecture: "", municipality: "", station: "架空ヶ丘" }),
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("内部の利回りは公開結果に含まれない", async () => {
    const result = await requestDiagnosis(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.result)).toEqual([
      "judgement",
      "marketPrice",
      "listedPriceMan",
      "difference",
    ]);
  });
});

describe("データ整合性", () => {
  it("有効なセルは必ず low <= high", () => {
    for (const sheet of master.sheets) {
      for (const row of sheet.rates) {
        for (const code of sheet.areaCodes) {
          const cell = row.byArea[code];
          expect(cell, `${sheet.name}/${row.label}/${code}`).toBeDefined();
          if (cell.valid) expect(cell.low).toBeLessThanOrEqual(cell.high);
        }
      }
    }
  });

  it("未解決の BLOCKER が無い", () => {
    expect(master.issues.filter((issue) => issue.level === "BLOCKER")).toEqual(
      [],
    );
  });

  it("東京23区がすべて登録されている", () => {
    const sheet = master.sheets.find((candidate) => candidate.key === "kanto");
    const wards = new Set(
      (sheet?.localities ?? [])
        .map((locality) => locality.name)
        .filter((name) => name.endsWith("区")),
    );
    expect(wards.size).toBe(23);
  });
});
