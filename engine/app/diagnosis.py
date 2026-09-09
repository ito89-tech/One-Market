"""Diagnosis calculations.

Every function here is pure: same input, same output, no I/O. The dataset is
passed in so tests can substitute a fixture. Money is handled with Decimal so
the 3.19 / 3.20 / 3.39 / 3.40 boundaries land exactly where the spec says.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from .dataset import AreaMatch, Dataset, RateRange, Sheet

YEN_PER_MAN = Decimal(10_000)
MONTHS_PER_YEAR = Decimal(12)
RATE_QUANTUM = Decimal("0.01")
WALK_YIELD_ADJUSTMENT = Decimal("0.10")
WALK_ADJUSTMENT_MINUTES = 10
AREA_WITHOUT_WALK_ADJUSTMENT = "1"

JUDGEMENT_UNDERPRICED = "UNDERPRICED"
JUDGEMENT_FAIR = "FAIR"
JUDGEMENT_OVERPRICED = "OVERPRICED"


class DiagnosisError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class PropertyInput:
    prefecture: str
    municipality: str
    station: str
    walk_minutes: int
    building_age: int
    price_yen: Decimal
    monthly_rent_yen: Decimal
    management_fee_yen: Decimal
    repair_reserve_yen: Decimal


@dataclass(frozen=True)
class DiagnosisResult:
    # ---- ユーザーに見せてよい情報 ----
    judgement: str
    market_price_low_man: int
    market_price_high_man: int
    listed_price_man: int
    difference_low_man: int
    difference_high_man: int
    # ---- 内部情報（公開 API では落とす） ----
    sheet_key: str
    sheet_name: str
    area_code: str
    matched_by: str
    matched_value: str | None
    age_bracket_label: str
    yield_percent: Decimal
    rate_low: Decimal
    rate_high: Decimal
    monthly_net_income_yen: Decimal
    annual_net_income_yen: Decimal


def calculate_net_income(
    monthly_rent_yen: Decimal,
    management_fee_yen: Decimal,
    repair_reserve_yen: Decimal,
) -> Decimal:
    """月間実質収入 = 月額賃料 − 管理費 − 修繕積立金"""
    return monthly_rent_yen - management_fee_yen - repair_reserve_yen


def calculate_annual_income(monthly_net_income_yen: Decimal) -> Decimal:
    return monthly_net_income_yen * MONTHS_PER_YEAR


def calculate_yield(annual_net_income_yen: Decimal, price_yen: Decimal) -> Decimal:
    """内部計算用の収益率（％）。ユーザー画面には出さない。"""
    if price_yen <= 0:
        raise DiagnosisError("INVALID_PRICE", "物件価格は 0 より大きい必要があります")
    return annual_net_income_yen / price_yen * Decimal(100)


def find_area_rule(dataset: Dataset, prefecture: str, station: str, municipality: str) -> tuple[Sheet, AreaMatch]:
    sheet = resolve_sheet_for_input(dataset, prefecture, station, municipality)
    return sheet, sheet.resolve_area(station, municipality)


def resolve_sheet_for_input(
    dataset: Dataset, prefecture: str, station: str, municipality: str
) -> Sheet:
    """駅マスタで一意にシートが決まるなら駅を優先。誤った地域へ自動判定しない。"""
    hits = dataset.find_station_hits(station)
    unique_keys: list[str] = []
    unique_sheets: list[Sheet] = []
    for sheet, _area in hits:
        if sheet.key not in unique_keys:
            unique_keys.append(sheet.key)
            unique_sheets.append(sheet)

    if len(unique_sheets) == 1:
        return unique_sheets[0]

    if len(unique_sheets) > 1:
        if prefecture.strip():
            chosen = dataset.resolve_sheet(prefecture)
            if chosen.key in unique_keys:
                return chosen
        names = "、".join(sheet.name for sheet in unique_sheets)
        raise DiagnosisError(
            "AMBIGUOUS_STATION",
            f"同名の駅が複数の地域にあります（{names}）。都道府県を選択してください。",
        )

    if not prefecture.strip() or not municipality.strip():
        raise DiagnosisError(
            "LOCATION_REQUIRED",
            "この駅は基準データに登録されていないため、都道府県と市区町村を入力してください。",
        )
    return dataset.resolve_sheet(prefecture)


def find_yield_rate(sheet: Sheet, area_code: str, building_age: int) -> tuple[str, RateRange]:
    bracket = sheet.resolve_age_bracket(building_age)
    if bracket is None:
        raise DiagnosisError(
            "AGE_OUT_OF_RANGE",
            "入力された築年数に対応する基準データがありません",
        )
    rate = sheet.find_rate(bracket, area_code)
    if rate is None or not rate.valid:
        raise DiagnosisError(
            "DATA_UNAVAILABLE",
            "この条件の基準データは現在ご利用いただけません",
        )
    return bracket.label, rate


def apply_walk_minutes_adjustment(
    rate: RateRange, area_code: str, walk_minutes: int
) -> RateRange:
    """①以外かつ駅徒歩10分以上なら yield range の low/high に +0.10% する。

    元データのセルは変更しない。判定と相場価格の両方に使う最終レンジだけを返す。
    """
    if walk_minutes < WALK_ADJUSTMENT_MINUTES:
        return rate
    if area_code == AREA_WITHOUT_WALK_ADJUSTMENT:
        return rate
    return RateRange(
        low=rate.low + WALK_YIELD_ADJUSTMENT,
        high=rate.high + WALK_YIELD_ADJUSTMENT,
        raw=rate.raw,
        valid=rate.valid,
    )


def calculate_market_price(annual_net_income_yen: Decimal, rate: RateRange) -> tuple[Decimal, Decimal]:
    """相場価格帯（円）。収益率が高いほど価格は安くなる逆関係に注意。"""
    low_price = annual_net_income_yen / (rate.high / Decimal(100))
    high_price = annual_net_income_yen / (rate.low / Decimal(100))
    return low_price, high_price


def judge_price(yield_percent: Decimal, rate: RateRange) -> str:
    """レンジ [low, high] を境界含みの「相場通り」とする 3 段階判定。"""
    value = yield_percent.quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP)
    if value < rate.low:
        return JUDGEMENT_OVERPRICED
    if value > rate.high:
        return JUDGEMENT_UNDERPRICED
    return JUDGEMENT_FAIR


def to_man_yen(value_yen: Decimal) -> int:
    """表示用に 1 万円未満を切り捨てる。判定には使わない。内部計算は円のまま。"""
    return int((value_yen / YEN_PER_MAN).to_integral_value(rounding=ROUND_DOWN))


def diagnose(dataset: Dataset, data: PropertyInput) -> DiagnosisResult:
    monthly_net = calculate_net_income(
        data.monthly_rent_yen, data.management_fee_yen, data.repair_reserve_yen
    )
    if monthly_net <= 0:
        raise DiagnosisError(
            "NON_POSITIVE_INCOME",
            "管理費と修繕積立金の合計が月額賃料以上のため診断できません",
        )

    annual_net = calculate_annual_income(monthly_net)
    yield_percent = calculate_yield(annual_net, data.price_yen)

    sheet, area = find_area_rule(dataset, data.prefecture, data.station, data.municipality)
    bracket_label, base_rate = find_yield_rate(sheet, area.area_code, data.building_age)
    rate = apply_walk_minutes_adjustment(base_rate, area.area_code, data.walk_minutes)

    low_price, high_price = calculate_market_price(annual_net, rate)
    judgement = judge_price(yield_percent, rate)

    low_man = to_man_yen(low_price)
    high_man = to_man_yen(high_price)
    listed_man = to_man_yen(data.price_yen)

    if judgement == JUDGEMENT_OVERPRICED:
        diff_low, diff_high = listed_man - high_man, listed_man - low_man
    elif judgement == JUDGEMENT_UNDERPRICED:
        diff_low, diff_high = low_man - listed_man, high_man - listed_man
    else:
        diff_low, diff_high = 0, 0

    # 丸めで負に振れた場合は差額を出さない（判定と矛盾した表示を避ける）
    diff_low = max(diff_low, 0)
    diff_high = max(diff_high, 0)

    return DiagnosisResult(
        judgement=judgement,
        market_price_low_man=low_man,
        market_price_high_man=high_man,
        listed_price_man=listed_man,
        difference_low_man=min(diff_low, diff_high),
        difference_high_man=max(diff_low, diff_high),
        sheet_key=sheet.key,
        sheet_name=sheet.name,
        area_code=area.area_code,
        matched_by=area.matched_by,
        matched_value=area.matched_value,
        age_bracket_label=bracket_label,
        yield_percent=yield_percent,
        rate_low=rate.low,
        rate_high=rate.high,
        monthly_net_income_yen=monthly_net,
        annual_net_income_yen=annual_net,
    )
