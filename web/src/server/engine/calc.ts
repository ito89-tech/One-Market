/**
 * 診断計算（純粋関数のみ）。
 *
 * engine/app/diagnosis.py の移植。同じ入力なら同じ出力になり、I/O は持たない。
 * 金額は Decimal で扱う。仕様が指定する 3.19 / 3.20 / 3.39 / 3.40 の境界を
 * 浮動小数の誤差で跨がせないため、number での計算にしてはいけない。
 */
import DecimalJs from "decimal.js";

/**
 * Python の decimal 既定コンテキスト（prec=28 / ROUND_HALF_EVEN）に合わせる。
 * decimal.js の既定は precision 20 なので、揃えないと割り算の桁数がずれる。
 * clone して使うのは、他の箇所の Decimal 設定に影響を出さないため。
 */
export const Decimal = DecimalJs.clone({
  precision: 28,
  rounding: DecimalJs.ROUND_HALF_EVEN,
});

export type Decimal = InstanceType<typeof Decimal>;

export const YEN_PER_MAN = new Decimal(10_000);
const MONTHS_PER_YEAR = new Decimal(12);
const HUNDRED = new Decimal(100);

/** 駅徒歩10分以上で利回りに加算する補正値（①エリアは対象外）。 */
const WALK_YIELD_ADJUSTMENT = new Decimal("0.10");
const WALK_ADJUSTMENT_MINUTES = 10;
const AREA_WITHOUT_WALK_ADJUSTMENT = "1";

export type Judgement = "UNDERPRICED" | "FAIR" | "OVERPRICED";

export const JUDGEMENT_UNDERPRICED = "UNDERPRICED" satisfies Judgement;
export const JUDGEMENT_FAIR = "FAIR" satisfies Judgement;
export const JUDGEMENT_OVERPRICED = "OVERPRICED" satisfies Judgement;

export type DiagnosisErrorCode =
  | "INVALID_PRICE"
  | "NON_POSITIVE_INCOME"
  | "AGE_OUT_OF_RANGE"
  | "DATA_UNAVAILABLE"
  | "AMBIGUOUS_STATION"
  | "LOCATION_REQUIRED";

export class DiagnosisError extends Error {
  readonly code: DiagnosisErrorCode;

  constructor(code: DiagnosisErrorCode, message: string) {
    super(message);
    this.name = "DiagnosisError";
    this.code = code;
  }
}

export type RateRange = {
  low: Decimal;
  high: Decimal;
  raw: string;
  valid: boolean;
};

export type PropertyInputYen = {
  walkMinutes: number;
  buildingAge: number;
  priceYen: Decimal;
  monthlyRentYen: Decimal;
  managementFeeYen: Decimal;
  repairReserveYen: Decimal;
};

/** 月間実質収入 = 月額賃料 − 管理費 − 修繕積立金 */
export function calculateNetIncome(
  monthlyRentYen: Decimal,
  managementFeeYen: Decimal,
  repairReserveYen: Decimal,
): Decimal {
  return monthlyRentYen.minus(managementFeeYen).minus(repairReserveYen);
}

export function calculateAnnualIncome(monthlyNetIncomeYen: Decimal): Decimal {
  return monthlyNetIncomeYen.times(MONTHS_PER_YEAR);
}

/** 内部計算用の収益率（％）。ユーザー画面には出さない。 */
export function calculateYield(
  annualNetIncomeYen: Decimal,
  priceYen: Decimal,
): Decimal {
  if (priceYen.lessThanOrEqualTo(0)) {
    throw new DiagnosisError(
      "INVALID_PRICE",
      "物件価格は 0 より大きい必要があります",
    );
  }
  return annualNetIncomeYen.div(priceYen).times(HUNDRED);
}

/**
 * ①以外かつ駅徒歩10分以上なら利回りレンジの low/high に +0.10% する。
 * 元データのセルは書き換えず、判定と相場価格に使う最終レンジだけを返す。
 */
export function applyWalkMinutesAdjustment(
  rate: RateRange,
  areaCode: string,
  walkMinutes: number,
): RateRange {
  if (walkMinutes < WALK_ADJUSTMENT_MINUTES) return rate;
  if (areaCode === AREA_WITHOUT_WALK_ADJUSTMENT) return rate;
  return {
    low: rate.low.plus(WALK_YIELD_ADJUSTMENT),
    high: rate.high.plus(WALK_YIELD_ADJUSTMENT),
    raw: rate.raw,
    valid: rate.valid,
  };
}

/** 相場価格帯（円）。収益率が高いほど価格は安くなる逆関係に注意。 */
export function calculateMarketPrice(
  annualNetIncomeYen: Decimal,
  rate: RateRange,
): { lowPriceYen: Decimal; highPriceYen: Decimal } {
  return {
    lowPriceYen: annualNetIncomeYen.div(rate.high.div(HUNDRED)),
    highPriceYen: annualNetIncomeYen.div(rate.low.div(HUNDRED)),
  };
}

/** レンジ [low, high] を境界含みの「相場通り」とする 3 段階判定。 */
export function judgePrice(yieldPercent: Decimal, rate: RateRange): Judgement {
  const value = yieldPercent.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP);
  if (value.lessThan(rate.low)) return JUDGEMENT_OVERPRICED;
  if (value.greaterThan(rate.high)) return JUDGEMENT_UNDERPRICED;
  return JUDGEMENT_FAIR;
}

/** 表示用に1万円未満を切り捨てる。判定には使わない（内部計算は円のまま）。 */
export function toManYen(valueYen: Decimal): number {
  return valueYen
    .div(YEN_PER_MAN)
    .toDecimalPlaces(0, DecimalJs.ROUND_DOWN)
    .toNumber();
}

export type PriceBand = {
  judgement: Judgement;
  marketPriceLowMan: number;
  marketPriceHighMan: number;
  listedPriceMan: number;
  differenceLowMan: number;
  differenceHighMan: number;
  yieldPercent: Decimal;
  rateLow: Decimal;
  rateHigh: Decimal;
  monthlyNetIncomeYen: Decimal;
  annualNetIncomeYen: Decimal;
};

/**
 * 収支から判定と価格帯までを算出する。エリア・築年数区分の解決は呼び出し側の
 * 責務で、ここには持ち込まない（データ参照を含めないため）。
 */
export function evaluatePrice(
  input: PropertyInputYen,
  areaCode: string,
  baseRate: RateRange,
): PriceBand {
  const monthlyNet = calculateNetIncome(
    input.monthlyRentYen,
    input.managementFeeYen,
    input.repairReserveYen,
  );
  if (monthlyNet.lessThanOrEqualTo(0)) {
    throw new DiagnosisError(
      "NON_POSITIVE_INCOME",
      "管理費と修繕積立金の合計が月額賃料以上のため診断できません",
    );
  }

  const annualNet = calculateAnnualIncome(monthlyNet);
  const yieldPercent = calculateYield(annualNet, input.priceYen);
  const rate = applyWalkMinutesAdjustment(baseRate, areaCode, input.walkMinutes);

  const { lowPriceYen, highPriceYen } = calculateMarketPrice(annualNet, rate);
  const judgement = judgePrice(yieldPercent, rate);

  const lowMan = toManYen(lowPriceYen);
  const highMan = toManYen(highPriceYen);
  const listedMan = toManYen(input.priceYen);

  let diffLow = 0;
  let diffHigh = 0;
  if (judgement === JUDGEMENT_OVERPRICED) {
    diffLow = listedMan - highMan;
    diffHigh = listedMan - lowMan;
  } else if (judgement === JUDGEMENT_UNDERPRICED) {
    diffLow = lowMan - listedMan;
    diffHigh = highMan - listedMan;
  }

  // 丸めで負に振れた場合は差額を出さない（判定と矛盾した表示を避ける）
  diffLow = Math.max(diffLow, 0);
  diffHigh = Math.max(diffHigh, 0);

  return {
    judgement,
    marketPriceLowMan: lowMan,
    marketPriceHighMan: highMan,
    listedPriceMan: listedMan,
    differenceLowMan: Math.min(diffLow, diffHigh),
    differenceHighMan: Math.max(diffLow, diffHigh),
    yieldPercent,
    rateLow: rate.low,
    rateHigh: rate.high,
    monthlyNetIncomeYen: monthlyNet,
    annualNetIncomeYen: annualNet,
  };
}
