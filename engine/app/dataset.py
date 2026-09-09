"""Load and index the normalised yield master produced from the client's .ods.

The dataset is treated as read-only truth. Nothing here invents, defaults or
repairs a value: cells the converter marked invalid stay invalid and surface as
DATA_UNAVAILABLE at diagnosis time.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

WARD = "ward"
CITY = "city"
TOWN = "town"

# Order in which 市区町村 candidates are tried. Narrower administrative units
# win, otherwise 大阪市 (②) would shadow 淀川区 etc. (③) on the Kansai sheet.
LOCALITY_PRIORITY = (WARD, CITY, TOWN, "other")


def default_dataset_path() -> Path:
    env = os.getenv("YIELD_DATASET_PATH")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "data" / "yield-master.json"


def normalise_common(value: str) -> str:
    text = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", "", text)


def station_key(value: str) -> str:
    """Lookup key for a station name.

    Only a trailing 駅 is dropped, so 「横浜駅」 and 「横浜」 collapse to the same key
    while 「横浜市」 stays a different string entirely.
    """
    text = normalise_common(value)
    if len(text) > 1 and text.endswith("駅"):
        text = text[:-1]
    text = text.replace("・", "").replace("･", "")
    return text.replace("ヶ", "ケ").replace("ヵ", "ケ")


def locality_key(value: str) -> str:
    return normalise_common(value)


@dataclass(frozen=True)
class RateRange:
    low: Decimal
    high: Decimal
    raw: str
    valid: bool


@dataclass(frozen=True)
class AgeBracket:
    label: str
    age_min: int
    age_max: int | None

    def contains(self, age: int) -> bool:
        if age < self.age_min:
            return False
        return self.age_max is None or age <= self.age_max


@dataclass(frozen=True)
class AreaMatch:
    area_code: str
    matched_by: str  # "station" | "locality" | "default"
    matched_value: str | None


class Sheet:
    def __init__(self, raw: dict) -> None:
        self.key: str = raw["key"]
        self.name: str = raw["name"]
        self.prefectures: list[str] = raw["prefectures"]
        self.is_fallback: bool = raw["isFallback"]
        self.area_codes: list[str] = raw["areaCodes"]
        self.default_area: str = raw["defaultArea"]

        self._brackets: list[AgeBracket] = []
        self._rates: dict[tuple[str, str], RateRange] = {}
        for row in raw["rates"]:
            bracket = AgeBracket(row["label"], row["ageMin"], row["ageMax"])
            self._brackets.append(bracket)
            for area_code, cell in row["byArea"].items():
                self._rates[(bracket.label, area_code)] = RateRange(
                    low=Decimal(str(cell["low"])),
                    high=Decimal(str(cell["high"])),
                    raw=cell["raw"],
                    valid=bool(cell["valid"]),
                )

        self._stations: dict[str, str] = {s["key"]: s["area"] for s in raw["stations"]}
        self.station_names: list[str] = [s["name"] for s in raw["stations"]]
        self.station_records: list[dict] = list(raw["stations"])

        self._localities: dict[str, dict[str, str]] = {kind: {} for kind in LOCALITY_PRIORITY}
        for entry in raw["localities"]:
            kind = entry["kind"] if entry["kind"] in self._localities else "other"
            self._localities[kind][entry["key"]] = entry["area"]
        self.locality_names: list[str] = [entry["name"] for entry in raw["localities"]]

    def resolve_area(self, station: str | None, municipality: str | None) -> AreaMatch:
        """駅名 → 市区町村 → それ以外 の順で照合する。順序を入れ替えてはいけない。"""
        if station:
            key = station_key(station)
            area = self._stations.get(key)
            if area is not None:
                return AreaMatch(area, "station", key)

        if municipality:
            key = locality_key(municipality)
            for kind in LOCALITY_PRIORITY:
                area = self._localities[kind].get(key)
                if area is not None:
                    return AreaMatch(area, "locality", key)

        return AreaMatch(self.default_area, "default", None)

    def resolve_age_bracket(self, age: int) -> AgeBracket | None:
        for bracket in self._brackets:
            if bracket.contains(age):
                return bracket
        return None

    def find_rate(self, bracket: AgeBracket, area_code: str) -> RateRange | None:
        return self._rates.get((bracket.label, area_code))

    def station_area(self, station: str) -> str | None:
        key = station_key(station)
        if not key:
            return None
        return self._stations.get(key)


class Dataset:
    def __init__(self, raw: dict) -> None:
        self.raw = raw
        self.sheets = [Sheet(s) for s in raw["sheets"]]
        self.issues: list[dict] = raw.get("issues", [])
        self.generated_at: str = raw.get("generatedAt", "")

        self._by_prefecture: dict[str, Sheet] = {}
        self._fallback: Sheet | None = None
        for sheet in self.sheets:
            for prefecture in sheet.prefectures:
                self._by_prefecture[normalise_common(prefecture)] = sheet
            if sheet.is_fallback:
                self._fallback = sheet
        if self._fallback is None:
            raise ValueError("記載外の都道府県に適用するフォールバックシートがありません")

    def resolve_sheet(self, prefecture: str) -> Sheet:
        return self._by_prefecture.get(normalise_common(prefecture), self._fallback)

    def find_station_hits(self, station: str) -> list[tuple[Sheet, str]]:
        """Sheets that contain this station key. Empty when the name is unknown."""
        key = station_key(station)
        if not key:
            return []
        hits: list[tuple[Sheet, str]] = []
        for sheet in self.sheets:
            area = sheet.station_area(station)
            if area is not None:
                hits.append((sheet, area))
        return hits

    @property
    def station_count(self) -> int:
        return sum(len(s.station_names) for s in self.sheets)

    @property
    def locality_count(self) -> int:
        return sum(len(s.locality_names) for s in self.sheets)


def load_dataset(path: Path | None = None) -> Dataset:
    target = path or default_dataset_path()
    with open(target, encoding="utf-8") as fh:
        return Dataset(json.load(fh))


@lru_cache(maxsize=1)
def get_dataset() -> Dataset:
    return load_dataset()
