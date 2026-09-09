"""Diagnosis engine tests.

Covers the four areas the spec calls out as mandatory: the worked example,
station-before-municipality priority, the 3.19/3.20/3.39/3.40 boundaries, and
abnormal input.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.dataset import RateRange, get_dataset, locality_key, station_key
from app.diagnosis import (
    DiagnosisError,
    PropertyInput,
    apply_walk_minutes_adjustment,
    calculate_annual_income,
    calculate_market_price,
    calculate_net_income,
    calculate_yield,
    diagnose,
    find_yield_rate,
    judge_price,
    to_man_yen,
)


@pytest.fixture(scope="module")
def dataset():
    return get_dataset()


def make_input(**overrides) -> PropertyInput:
    base = dict(
        prefecture="東京都",
        municipality="渋谷区",
        station="渋谷",
        walk_minutes=5,
        building_age=7,
        price_yen=Decimal(26_700_000),
        monthly_rent_yen=Decimal(90_000),
        management_fee_yen=Decimal(7_820),
        repair_reserve_yen=Decimal(4_260),
    )
    base.update(overrides)
    return PropertyInput(**base)


# --------------------------------------------------------------------------
# 収支計算（指示書 §4 の例）
# --------------------------------------------------------------------------

def test_worked_example_from_spec():
    monthly = calculate_net_income(Decimal(90_000), Decimal(7_820), Decimal(4_260))
    assert monthly == Decimal(77_920)

    annual = calculate_annual_income(monthly)
    assert annual == Decimal(935_040)

    rate = calculate_yield(annual, Decimal(26_700_000))
    assert rate.quantize(Decimal("0.01")) == Decimal("3.50")


def test_yield_rejects_zero_price():
    with pytest.raises(DiagnosisError) as exc:
        calculate_yield(Decimal(935_040), Decimal(0))
    assert exc.value.code == "INVALID_PRICE"


# --------------------------------------------------------------------------
# エリア判定: 駅名 → 市区町村 の優先順位（指示書 §6・§37）
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "station,municipality,expected_area,expected_matched_by",
    [
        # 駅名が最優先。横浜市(③)ではなく横浜駅(①)。
        ("横浜", "横浜市", "1", "station"),
        ("横浜駅", "横浜市", "1", "station"),
        # 武蔵小杉駅(②) は 川崎市(③) に優先する。
        ("武蔵小杉", "川崎市", "2", "station"),
        ("川崎", "川崎市", "2", "station"),
        # 駅が未登録なら市区町村で判定する。
        ("", "横浜市", "3", "locality"),
        ("", "川崎市", "3", "locality"),
        # 未登録の駅名は市区町村へフォールバックする（あいまい一致はしない）。
        ("架空ヶ丘", "横浜市", "3", "locality"),
        ("架空ヶ丘", "渋谷区", "2", "locality"),
        # どちらも未登録なら「それ以外」。
        ("架空ヶ丘", "架空市", "4", "default"),
    ],
)
def test_area_priority_station_before_municipality(
    dataset, station, municipality, expected_area, expected_matched_by
):
    sheet = dataset.resolve_sheet("東京都")
    match = sheet.resolve_area(station, municipality)
    assert match.area_code == expected_area
    assert match.matched_by == expected_matched_by


def test_station_name_never_matches_municipality_name(dataset):
    """「横浜」(駅) と「横浜市」(市) を同一視してはいけない。"""
    sheet = dataset.resolve_sheet("神奈川県")
    assert sheet.resolve_area("横浜市", "").matched_by == "default"
    assert sheet.resolve_area("横浜", "").area_code == "1"


def test_ward_beats_city(dataset):
    """大阪市(②) より 淀川区(③) を優先する。"""
    sheet = dataset.resolve_sheet("大阪府")
    assert sheet.resolve_area("", "淀川区").area_code == "3"
    assert sheet.resolve_area("", "大阪市").area_code == "2"


def test_station_key_normalisation():
    assert station_key("横浜駅") == station_key("横浜")
    assert station_key("横浜市") != station_key("横浜")
    assert station_key("天満駅") == station_key("天満")
    assert station_key("元町・中華街") == station_key("元町中華街")
    assert station_key("阿佐ヶ谷") == station_key("阿佐ケ谷")
    assert station_key("  渋　谷 ") == "渋谷"
    # 一文字の「駅」は削らない
    assert station_key("駅") == "駅"


def test_locality_key_keeps_suffix():
    assert locality_key("横浜市") == "横浜市"
    assert locality_key("渋谷区") != locality_key("渋谷")


# --------------------------------------------------------------------------
# シート選択
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "prefecture,expected_key",
    [
        ("東京都", "kanto"),
        ("神奈川県", "kanto"),
        ("埼玉県", "kanto"),
        ("千葉県", "kanto"),
        ("大阪府", "kansai"),
        ("京都府", "kansai"),
        ("兵庫県", "kansai"),
        ("福岡県", "fukuoka"),
        ("愛知県", "aichi_other"),
        # シートに記載の無い都道府県は「愛知・その他」に統一する（シート内の注記）
        ("広島県", "aichi_other"),
        ("岐阜県", "aichi_other"),
        ("北海道", "aichi_other"),
    ],
)
def test_sheet_resolution(dataset, prefecture, expected_key):
    assert dataset.resolve_sheet(prefecture).key == expected_key


def test_same_station_name_disambiguated_by_prefecture(dataset):
    """「赤坂」は東京①と福岡①、「京橋」は東京①と大阪②にある。"""
    assert dataset.resolve_sheet("東京都").resolve_area("京橋", "").area_code == "1"
    assert dataset.resolve_sheet("大阪府").resolve_area("京橋", "").area_code == "2"


# --------------------------------------------------------------------------
# 築年数区分
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "age,expected_label",
    [(0, "0~1"), (1, "0~1"), (2, "2"), (34, "34"), (35, "35以上"), (60, "35以上")],
)
def test_age_bracket(dataset, age, expected_label):
    sheet = dataset.resolve_sheet("東京都")
    assert sheet.resolve_age_bracket(age).label == expected_label


def test_tokyo_area1_age7_matches_spec_thresholds(dataset):
    """指示書 §11 の 3.20%-3.39% は 東京①・築7年 のセルと一致する。"""
    sheet = dataset.resolve_sheet("東京都")
    label, rate = find_yield_rate(sheet, "1", 7)
    assert label == "7"
    assert (rate.low, rate.high) == (Decimal("3.20"), Decimal("3.39"))


# --------------------------------------------------------------------------
# 境界値（指示書 §37 で必須指定）
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "yield_percent,expected",
    [
        ("3.00", "OVERPRICED"),
        ("3.19", "OVERPRICED"),
        ("3.20", "FAIR"),
        ("3.30", "FAIR"),
        ("3.39", "FAIR"),
        ("3.40", "UNDERPRICED"),
        ("5.00", "UNDERPRICED"),
    ],
)
def test_judgement_boundaries(dataset, yield_percent, expected):
    sheet = dataset.resolve_sheet("東京都")
    _, rate = find_yield_rate(sheet, "1", 7)
    assert judge_price(Decimal(yield_percent), rate) == expected


def test_boundaries_end_to_end(dataset):
    """収益率がちょうど 3.19/3.20/3.39/3.40 になる価格を逆算して通しで確認する。"""
    annual = Decimal(935_040)
    expectations = {
        "3.19": "OVERPRICED",
        "3.20": "FAIR",
        "3.39": "FAIR",
        "3.40": "UNDERPRICED",
    }
    for rate_str, expected in expectations.items():
        price = annual / (Decimal(rate_str) / Decimal(100))
        result = diagnose(
            dataset,
            make_input(price_yen=price, building_age=7, station="渋谷"),
        )
        assert result.judgement == expected, rate_str


# --------------------------------------------------------------------------
# 相場価格帯
# --------------------------------------------------------------------------

def test_market_price_inverse_relationship(dataset):
    sheet = dataset.resolve_sheet("東京都")
    _, rate = find_yield_rate(sheet, "1", 7)
    low, high = calculate_market_price(Decimal(935_040), rate)
    # 高い収益率ほど安い価格
    assert low < high
    assert low == Decimal(935_040) / (rate.high / Decimal(100))
    assert high == Decimal(935_040) / (rate.low / Decimal(100))


def test_full_diagnosis_spec_example_is_underpriced(dataset):
    """指示書 §4 の数値例（渋谷駅・築7年・2,670万円）。

    収益率 3.50% は 東京①・築7年 のレンジ 3.20%-3.39% の上限を超えるので割安。
    """
    result = diagnose(dataset, make_input())
    assert result.judgement == "UNDERPRICED"
    assert result.area_code == "1"
    assert result.matched_by == "station"
    assert result.age_bracket_label == "7"
    # 935,040 / 3.39% = 27,582,300 円 ≒ 2,758 万円
    # 935,040 / 3.20% = 29,220,000 円 = 2,922 万円
    assert result.market_price_low_man == 2758
    assert result.market_price_high_man == 2922
    assert result.listed_price_man == 2670
    assert result.difference_low_man == 2758 - 2670
    assert result.difference_high_man == 2922 - 2670


def test_full_diagnosis_overpriced(dataset):
    """同条件で価格だけ 3,200 万円に上げると割高になる（収益率 2.92%）。"""
    result = diagnose(dataset, make_input(price_yen=Decimal(32_000_000)))
    assert result.judgement == "OVERPRICED"
    assert result.listed_price_man == 3200
    assert result.difference_low_man == 3200 - 2922
    assert result.difference_high_man == 3200 - 2758


def test_judgement_and_price_band_never_contradict(dataset):
    """判定と価格帯の整合。割安なら提示価格 < 相場下限、割高なら > 相場上限。"""
    for price in (15_000_000, 22_000_000, 27_582_300, 28_000_000, 29_220_000, 40_000_000):
        result = diagnose(dataset, make_input(price_yen=Decimal(price)))
        if result.judgement == "UNDERPRICED":
            assert result.listed_price_man <= result.market_price_low_man
        elif result.judgement == "OVERPRICED":
            assert result.listed_price_man >= result.market_price_high_man
        else:
            assert (
                result.market_price_low_man
                <= result.listed_price_man
                <= result.market_price_high_man
            )


def test_difference_is_zero_when_fair(dataset):
    annual = Decimal(935_040)
    price = annual / (Decimal("3.30") / Decimal(100))
    result = diagnose(dataset, make_input(price_yen=price))
    assert result.judgement == "FAIR"
    assert result.difference_low_man == 0
    assert result.difference_high_man == 0


def test_difference_is_always_ordered_and_non_negative(dataset):
    for price in (15_000_000, 26_700_000, 28_000_000, 40_000_000):
        result = diagnose(dataset, make_input(price_yen=Decimal(price)))
        assert 0 <= result.difference_low_man <= result.difference_high_man


def test_to_man_yen_floors_below_10000():
    assert to_man_yen(Decimal(26_700_000)) == 2670
    assert to_man_yen(Decimal(2_758_999)) == 275
    assert to_man_yen(Decimal(26_709_999)) == 2670
    assert to_man_yen(Decimal(27_582_300)) == 2758


# --------------------------------------------------------------------------
# 異常系
# --------------------------------------------------------------------------

def test_non_positive_income_rejected(dataset):
    with pytest.raises(DiagnosisError) as exc:
        diagnose(
            dataset,
            make_input(management_fee_yen=Decimal(60_000), repair_reserve_yen=Decimal(30_000)),
        )
    assert exc.value.code == "NON_POSITIVE_INCOME"


def test_invalid_yield_cell_is_not_guessed(dataset, monkeypatch):
    """不正な yield cell は値を直さず DATA_UNAVAILABLE にする。"""
    sheet = dataset.resolve_sheet("東京都")
    invalid = RateRange(Decimal("4.70"), Decimal("4.49"), "4.70%-4.49%", False)
    monkeypatch.setattr(sheet, "find_rate", lambda bracket, area: invalid)
    with pytest.raises(DiagnosisError) as exc:
        find_yield_rate(sheet, "4", 35)
    assert exc.value.code == "DATA_UNAVAILABLE"


def test_tokyo_area4_age35_from_xlsx_is_valid(dataset):
    """最新xlsxでは東京④・築35年以上は 4.70%-4.89% で有効。"""
    sheet = dataset.resolve_sheet("東京都")
    label, rate = find_yield_rate(sheet, "4", 35)
    assert label == "35以上"
    assert rate.valid
    assert (rate.low, rate.high) == (Decimal("4.70"), Decimal("4.89"))

    result = diagnose(
        dataset,
        make_input(station="架空ヶ丘", municipality="架空市", building_age=35),
    )
    assert result.area_code == "4"
    assert (result.rate_low, result.rate_high) == (Decimal("4.70"), Decimal("4.89"))


def test_neighbouring_valid_cell_still_works(dataset):
    """BLOCKER セルの隣（築34年）は正常に診断できる。"""
    result = diagnose(
        dataset,
        make_input(station="架空ヶ丘", municipality="架空市", building_age=34),
    )
    assert result.area_code == "4"
    assert (result.rate_low, result.rate_high) == (Decimal("4.60"), Decimal("4.79"))


# --------------------------------------------------------------------------
# データ整合性
# --------------------------------------------------------------------------

def test_every_valid_cell_has_low_le_high(dataset):
    for sheet in dataset.sheets:
        for bracket in sheet._brackets:
            for area in sheet.area_codes:
                rate = sheet.find_rate(bracket, area)
                assert rate is not None, f"{sheet.name}/{bracket.label}/{area}"
                if rate.valid:
                    assert rate.low <= rate.high


def test_dataset_has_no_blocker_issues(dataset):
    blockers = [i for i in dataset.issues if i["level"] == "BLOCKER"]
    assert blockers == []


def test_tokyo_23_wards_are_fully_covered(dataset):
    sheet = dataset.resolve_sheet("東京都")
    wards = {n for n in sheet.locality_names if n.endswith("区")}
    assert len(wards) == 23


# --------------------------------------------------------------------------
# 駅徒歩10分以上の補正（①以外 +0.10%）
# --------------------------------------------------------------------------

def test_walk_adjustment_skips_area_1():
    base = RateRange(Decimal("3.20"), Decimal("3.29"), "3.20%-3.29%", True)
    assert apply_walk_minutes_adjustment(base, "1", 9) is base
    assert apply_walk_minutes_adjustment(base, "1", 10) is base
    assert apply_walk_minutes_adjustment(base, "1", 11) is base


def test_walk_adjustment_applies_from_10_minutes_outside_area_1():
    base = RateRange(Decimal("3.30"), Decimal("3.39"), "3.30%-3.39%", True)
    unchanged = apply_walk_minutes_adjustment(base, "2", 9)
    assert (unchanged.low, unchanged.high) == (Decimal("3.30"), Decimal("3.39"))
    adjusted_10 = apply_walk_minutes_adjustment(base, "2", 10)
    assert (adjusted_10.low, adjusted_10.high) == (Decimal("3.40"), Decimal("3.49"))
    adjusted_11 = apply_walk_minutes_adjustment(base, "2", 11)
    assert (adjusted_11.low, adjusted_11.high) == (Decimal("3.40"), Decimal("3.49"))
    area3 = apply_walk_minutes_adjustment(base, "3", 10)
    assert (area3.low, area3.high) == (Decimal("3.40"), Decimal("3.49"))


def test_yoyogi_area1_walk_10_keeps_table_range(dataset):
    result = diagnose(
        dataset,
        make_input(
            prefecture="",
            municipality="",
            station="代々木駅",
            walk_minutes=10,
            building_age=2,
        ),
    )
    assert result.area_code == "1"
    assert (result.rate_low, result.rate_high) == (Decimal("3.20"), Decimal("3.29"))


def test_kamata_area2_walk_boundaries(dataset):
    common = dict(prefecture="", municipality="", station="蒲田駅", building_age=2)
    nine = diagnose(dataset, make_input(**common, walk_minutes=9))
    ten = diagnose(dataset, make_input(**common, walk_minutes=10))
    eleven = diagnose(dataset, make_input(**common, walk_minutes=11))
    assert nine.area_code == ten.area_code == eleven.area_code == "2"
    assert (nine.rate_low, nine.rate_high) == (Decimal("3.30"), Decimal("3.39"))
    assert (ten.rate_low, ten.rate_high) == (Decimal("3.40"), Decimal("3.49"))
    assert (eleven.rate_low, eleven.rate_high) == (Decimal("3.40"), Decimal("3.49"))


def test_area3_walk_10_is_adjusted(dataset):
    result = diagnose(
        dataset,
        make_input(
            station="架空ヶ丘",
            municipality="横浜市",
            walk_minutes=10,
            building_age=2,
        ),
    )
    assert result.area_code == "3"
    assert (result.rate_low, result.rate_high) == (Decimal("3.70"), Decimal("3.79"))


def test_unique_station_does_not_need_prefecture(dataset):
    result = diagnose(
        dataset,
        make_input(prefecture="", municipality="", station="横浜駅"),
    )
    assert result.area_code == "1"
    assert result.matched_by == "station"


def test_ambiguous_station_requires_prefecture(dataset):
    with pytest.raises(DiagnosisError) as exc:
        diagnose(dataset, make_input(prefecture="", municipality="", station="赤坂"))
    assert exc.value.code == "AMBIGUOUS_STATION"

    tokyo = diagnose(dataset, make_input(prefecture="東京都", municipality="", station="赤坂"))
    fukuoka = diagnose(dataset, make_input(prefecture="福岡県", municipality="", station="赤坂"))
    assert tokyo.sheet_key == "kanto"
    assert fukuoka.sheet_key == "fukuoka"


def test_unknown_station_requires_prefecture_and_municipality(dataset):
    with pytest.raises(DiagnosisError) as exc:
        diagnose(dataset, make_input(prefecture="", municipality="", station="架空ヶ丘"))
    assert exc.value.code == "LOCATION_REQUIRED"
