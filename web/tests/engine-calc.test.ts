/**
 * 診断計算の単体テスト（データベース非依存）。
 * engine/tests/test_diagnosis.py の純粋関数ぶんを移植したもの。
 */
import { describe, expect, it } from "vitest";

import {
  applyWalkMinutesAdjustment,
  calculateAnnualIncome,
  calculateMarketPrice,
  calculateNetIncome,
  calculateYield,
  Decimal,
  DiagnosisError,
  evaluatePrice,
  judgePrice,
  toManYen,
  type RateRange,
} from "@/server/engine/calc";

function rate(low: string, high: string, valid = true): RateRange {
  return {
    low: new Decimal(low),
    high: new Decimal(high),
    raw: `${low}%-${high}%`,
    valid,
  };
}

/** 指示書 §4 の数値例（渋谷駅・築7年・2,670万円）。 */
function specInput(overrides: Partial<{ priceYen: string; walkMinutes: number }> = {}) {
  return {
    walkMinutes: overrides.walkMinutes ?? 5,
    buildingAge: 7,
    priceYen: new Decimal(overrides.priceYen ?? 26_700_000),
    monthlyRentYen: new Decimal(90_000),
    managementFeeYen: new Decimal(7_820),
    repairReserveYen: new Decimal(4_260),
  };
}

describe("収支計算（指示書 §4 の例）", () => {
  it("月間実質収入・年間収入・収益率が指示書の値と一致する", () => {
    const monthly = calculateNetIncome(
      new Decimal(90_000),
      new Decimal(7_820),
      new Decimal(4_260),
    );
    expect(monthly.toFixed(0)).toBe("77920");

    const annual = calculateAnnualIncome(monthly);
    expect(annual.toFixed(0)).toBe("935040");

    const percent = calculateYield(annual, new Decimal(26_700_000));
    expect(percent.toDecimalPlaces(2).toFixed(2)).toBe("3.50");
  });

  it("物件価格が0なら収益率を出さない", () => {
    expect(() => calculateYield(new Decimal(935_040), new Decimal(0))).toThrow(
      DiagnosisError,
    );
    try {
      calculateYield(new Decimal(935_040), new Decimal(0));
    } catch (error) {
      expect((error as DiagnosisError).code).toBe("INVALID_PRICE");
    }
  });

  it("実質収入が0以下なら診断しない", () => {
    expect(() =>
      evaluatePrice(
        {
          ...specInput(),
          managementFeeYen: new Decimal(60_000),
          repairReserveYen: new Decimal(30_000),
        },
        "1",
        rate("3.20", "3.39"),
      ),
    ).toThrow(/実質収入|月額賃料/);
  });
});

describe("境界値（指示書 §37 で必須指定）", () => {
  const band = rate("3.20", "3.39");

  it.each([
    ["3.00", "OVERPRICED"],
    ["3.19", "OVERPRICED"],
    ["3.20", "FAIR"],
    ["3.30", "FAIR"],
    ["3.39", "FAIR"],
    ["3.40", "UNDERPRICED"],
    ["5.00", "UNDERPRICED"],
  ])("収益率 %s は %s", (percent, expected) => {
    expect(judgePrice(new Decimal(percent), band)).toBe(expected);
  });

  it("収益率がちょうど境界になる価格を逆算しても判定が変わらない", () => {
    const annual = new Decimal(935_040);
    const expectations: Array<[string, string]> = [
      ["3.19", "OVERPRICED"],
      ["3.20", "FAIR"],
      ["3.39", "FAIR"],
      ["3.40", "UNDERPRICED"],
    ];

    for (const [percent, expected] of expectations) {
      const price = annual.div(new Decimal(percent).div(100));
      const result = evaluatePrice(
        { ...specInput(), priceYen: price },
        "1",
        band,
      );
      expect(result.judgement, percent).toBe(expected);
    }
  });
});

describe("相場価格帯", () => {
  it("収益率が高いほど価格は安くなる", () => {
    const band = rate("3.20", "3.39");
    const { lowPriceYen, highPriceYen } = calculateMarketPrice(
      new Decimal(935_040),
      band,
    );
    expect(lowPriceYen.lessThan(highPriceYen)).toBe(true);
    expect(lowPriceYen.toFixed(4)).toBe(
      new Decimal(935_040).div(band.high.div(100)).toFixed(4),
    );
    expect(highPriceYen.toFixed(4)).toBe(
      new Decimal(935_040).div(band.low.div(100)).toFixed(4),
    );
  });

  it("1万円未満を切り捨てて表示する", () => {
    expect(toManYen(new Decimal(26_700_000))).toBe(2670);
    expect(toManYen(new Decimal(2_758_999))).toBe(275);
    expect(toManYen(new Decimal(26_709_999))).toBe(2670);
    expect(toManYen(new Decimal(27_582_300))).toBe(2758);
  });

  it("指示書の例は割安と判定され、相場帯と差額が一致する", () => {
    const result = evaluatePrice(specInput(), "1", rate("3.20", "3.39"));
    expect(result.judgement).toBe("UNDERPRICED");
    expect(result.marketPriceLowMan).toBe(2758);
    expect(result.marketPriceHighMan).toBe(2922);
    expect(result.listedPriceMan).toBe(2670);
    expect(result.differenceLowMan).toBe(2758 - 2670);
    expect(result.differenceHighMan).toBe(2922 - 2670);
  });

  it("価格を上げると割高になり、差額の向きが入れ替わる", () => {
    const result = evaluatePrice(
      specInput({ priceYen: "32000000" }),
      "1",
      rate("3.20", "3.39"),
    );
    expect(result.judgement).toBe("OVERPRICED");
    expect(result.listedPriceMan).toBe(3200);
    expect(result.differenceLowMan).toBe(3200 - 2922);
    expect(result.differenceHighMan).toBe(3200 - 2758);
  });

  it("相場通りなら差額は0", () => {
    const price = new Decimal(935_040).div(new Decimal("3.30").div(100));
    const result = evaluatePrice(
      { ...specInput(), priceYen: price },
      "1",
      rate("3.20", "3.39"),
    );
    expect(result.judgement).toBe("FAIR");
    expect(result.differenceLowMan).toBe(0);
    expect(result.differenceHighMan).toBe(0);
  });

  it("判定と価格帯は矛盾せず、差額は常に0以上で昇順", () => {
    const band = rate("3.20", "3.39");
    for (const price of [
      15_000_000, 22_000_000, 27_582_300, 28_000_000, 29_220_000, 40_000_000,
    ]) {
      const result = evaluatePrice(
        { ...specInput(), priceYen: new Decimal(price) },
        "1",
        band,
      );
      expect(result.differenceLowMan).toBeGreaterThanOrEqual(0);
      expect(result.differenceHighMan).toBeGreaterThanOrEqual(
        result.differenceLowMan,
      );

      if (result.judgement === "UNDERPRICED") {
        expect(result.listedPriceMan).toBeLessThanOrEqual(
          result.marketPriceLowMan,
        );
      } else if (result.judgement === "OVERPRICED") {
        expect(result.listedPriceMan).toBeGreaterThanOrEqual(
          result.marketPriceHighMan,
        );
      } else {
        expect(result.listedPriceMan).toBeGreaterThanOrEqual(
          result.marketPriceLowMan,
        );
        expect(result.listedPriceMan).toBeLessThanOrEqual(
          result.marketPriceHighMan,
        );
      }
    }
  });
});

describe("駅徒歩10分以上の補正（①以外 +0.10%）", () => {
  it("①エリアは分数に関わらず補正しない", () => {
    const base = rate("3.20", "3.29");
    expect(applyWalkMinutesAdjustment(base, "1", 9)).toBe(base);
    expect(applyWalkMinutesAdjustment(base, "1", 10)).toBe(base);
    expect(applyWalkMinutesAdjustment(base, "1", 11)).toBe(base);
  });

  it("①以外は10分から補正する", () => {
    const base = rate("3.30", "3.39");

    expect(applyWalkMinutesAdjustment(base, "2", 9)).toBe(base);

    const ten = applyWalkMinutesAdjustment(base, "2", 10);
    expect([ten.low.toFixed(2), ten.high.toFixed(2)]).toEqual(["3.40", "3.49"]);

    const eleven = applyWalkMinutesAdjustment(base, "2", 11);
    expect([eleven.low.toFixed(2), eleven.high.toFixed(2)]).toEqual([
      "3.40",
      "3.49",
    ]);

    const area3 = applyWalkMinutesAdjustment(base, "3", 10);
    expect([area3.low.toFixed(2), area3.high.toFixed(2)]).toEqual([
      "3.40",
      "3.49",
    ]);
  });

  it("補正は元のレンジを書き換えない", () => {
    const base = rate("3.30", "3.39");
    applyWalkMinutesAdjustment(base, "2", 10);
    expect([base.low.toFixed(2), base.high.toFixed(2)]).toEqual([
      "3.30",
      "3.39",
    ]);
  });
});
