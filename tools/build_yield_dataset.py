"""Convert the client's 利回りシート into a normalised JSON master dataset.

The spreadsheet is the single source of truth. Prefer the latest .xlsx when
present; .ods is accepted as a fallback. This script only *reshapes* the file:
no value is inferred, defaulted or repaired. Anything that looks wrong is
reported in the `issues` list of the output so a human can decide.

Output: data/yield-master.json
"""

from __future__ import annotations

import argparse
import glob
import json
import re
import sys
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
T = "{%s}" % NS["table"]
XLSX_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
COL_REF_RE = re.compile(r"([A-Z]+)")

# Column layout of each sheet, read off the merged header rows (row 0 = area
# grouping, row 1 = column meaning). Verified against tools/ods_dump.txt.
#   station_cols  : columns listing 駅名 that map to the area
#   locality_cols : columns listing 市区町村 that map to the area
#   mixed_cols    : columns with no header where 区/市 and 駅 are interleaved
#   default       : the "それ以外" area used when nothing else matches
SHEET_LAYOUT = {
    "東京・埼玉・神奈川・千葉": {
        "key": "kanto",
        "prefectures": ["東京都", "埼玉県", "神奈川県", "千葉県"],
        "fallback": False,
        "rate_cols": {"1": 1, "2": 2, "3": 3, "4": 4},
        "areas": {
            "1": {"station_cols": [6, 7, 8, 9, 10, 11, 12], "locality_cols": []},
            "2": {"station_cols": [14], "locality_cols": [15]},
            "3": {"station_cols": [], "locality_cols": [17]},
            "4": {"station_cols": [], "locality_cols": []},
        },
        "default_area": "4",
    },
    "大阪・京都・兵庫": {
        "key": "kansai",
        "prefectures": ["大阪府", "京都府", "兵庫県"],
        "fallback": False,
        "rate_cols": {"1": 1, "2": 2, "3": 3, "4": 4},
        "areas": {
            "1": {"station_cols": [6], "locality_cols": []},
            # 列8は見出しが「市・区」だが実際には駅名も並んでいる。列10は見出し無し。
            # どちらも接尾辞で駅／市区町村を判別する。
            "2": {"station_cols": [], "locality_cols": [], "mixed_cols": [8]},
            "3": {"station_cols": [], "locality_cols": [], "mixed_cols": [10]},
            "4": {"station_cols": [], "locality_cols": []},
        },
        "default_area": "4",
    },
    "福岡": {
        "key": "fukuoka",
        "prefectures": ["福岡県"],
        "fallback": False,
        "rate_cols": {"1": 1, "2": 2, "3": 3},
        "areas": {
            "1": {"station_cols": [5], "locality_cols": []},
            "2": {"station_cols": [7], "locality_cols": []},
            "3": {"station_cols": [], "locality_cols": []},
        },
        "default_area": "3",
    },
    "愛知・その他": {
        "key": "aichi_other",
        "prefectures": ["愛知県"],
        # The sheet carries the note: 広島や岐阜など利回りシートに記載されている
        # 以外の都道府県や市町村はすべてこの利回りで統一してください
        "fallback": True,
        "rate_cols": {"1": 1, "2": 2, "3": 3},
        "areas": {
            "1": {"station_cols": [5], "locality_cols": []},
            "2": {"station_cols": [7], "locality_cols": []},
            "3": {"station_cols": [], "locality_cols": []},
        },
        "default_area": "3",
    },
}

TEMPLATE_SHEET = "雛形"

RATE_RE = re.compile(r"^(\d+(?:\.\d+)?)%\s*[-–~〜]\s*(\d+(?:\.\d+)?)%$")
AGE_EXACT_RE = re.compile(r"^(\d+)$")
AGE_FLOAT_RE = re.compile(r"^(\d+)\.0+$")
AGE_RANGE_RE = re.compile(r"^(\d+)\s*[~〜-]\s*(\d+)$")
AGE_OPEN_RE = re.compile(r"^(\d+)以上$")
XLSX_REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def cell_text(cell) -> str:
    return "\n".join(
        "".join(p.itertext()) for p in cell.findall("text:p", NS)
    ).strip()


def read_sheet(sheet) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in sheet.findall("table:table-row", NS):
        rrep = int(row.get(T + "number-rows-repeated", 1))
        cells: list[str] = []
        for cell in row:
            if cell.tag not in (T + "table-cell", T + "covered-table-cell"):
                continue
            crep = int(cell.get(T + "number-columns-repeated", 1))
            if crep > 100:
                crep = 1
            cells.extend([cell_text(cell)] * crep)
        while cells and cells[-1] == "":
            cells.pop()
        for _ in range(1 if rrep > 100 else rrep):
            rows.append(list(cells))
    while rows and not any(rows[-1]):
        rows.pop()
    return rows


def read_ods_sheets(path: str) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as zf:
        root = ET.fromstring(zf.read("content.xml"))
    return {s.get(T + "name"): read_sheet(s) for s in root.iter(T + "table")}


def _xlsx_col_index(cell_ref: str) -> int:
    letters = COL_REF_RE.match(cell_ref)
    if not letters:
        return 0
    n = 0
    for ch in letters.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out: list[str] = []
    for si in root.findall("m:si", XLSX_NS):
        texts = [t.text or "" for t in si.iter("{%s}t" % XLSX_NS["m"])]
        out.append("".join(texts))
    return out


def _xlsx_cell_value(cell, shared: list[str]) -> str:
    cell_type = cell.get("t")
    if cell_type == "s":
        v = cell.find("m:v", XLSX_NS)
        if v is None or v.text is None:
            return ""
        return shared[int(v.text)]
    if cell_type == "inlineStr":
        texts = [t.text or "" for t in cell.iter("{%s}t" % XLSX_NS["m"])]
        return "".join(texts)
    is_elem = cell.find("m:is", XLSX_NS)
    if is_elem is not None:
        texts = [t.text or "" for t in is_elem.iter("{%s}t" % XLSX_NS["m"])]
        return "".join(texts)
    v = cell.find("m:v", XLSX_NS)
    return v.text if v is not None and v.text is not None else ""


def _xlsx_sheet_rows(zf: zipfile.ZipFile, path: str, shared: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(path))
    rows: list[list[str]] = []
    for row in root.findall("m:sheetData/m:row", XLSX_NS):
        cells: dict[int, str] = {}
        max_idx = -1
        for cell in row.findall("m:c", XLSX_NS):
            ref = cell.get("r") or "A1"
            idx = _xlsx_col_index(ref)
            max_idx = max(max_idx, idx)
            value = _xlsx_cell_value(cell, shared).strip()
            if value:
                cells[idx] = value
        if max_idx < 0:
            rows.append([])
            continue
        line = [cells.get(i, "") for i in range(max_idx + 1)]
        while line and line[-1] == "":
            line.pop()
        rows.append(line)
    while rows and not any(rows[-1]):
        rows.pop()
    return rows


def read_xlsx_sheets(path: str) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(path) as zf:
        shared = _xlsx_shared_strings(zf)
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.get("Id"): rel.get("Target") for rel in rels}
        sheets: dict[str, list[list[str]]] = {}
        for sh in wb.findall("m:sheets/m:sheet", XLSX_NS):
            name = sh.get("name") or ""
            rid = sh.get(XLSX_REL_ID)
            target = (rid_to_target.get(rid) or "").lstrip("/")
            if not target:
                continue
            if not target.startswith("xl/"):
                target = "xl/" + target
            sheets[name] = _xlsx_sheet_rows(zf, target, shared)
    return sheets


def load_sheets(path: str) -> dict[str, list[list[str]]]:
    if path.lower().endswith(".xlsx"):
        return read_xlsx_sheets(path)
    return read_ods_sheets(path)


def find_source_spreadsheet() -> str | None:
    """Prefer the latest client xlsx. Ignore Excel lock files (~$)."""
    xlsx = [
        path
        for path in sorted(glob.glob("*.xlsx"))
        if not Path(path).name.startswith("~$")
    ]
    preferred = [path for path in xlsx if "利回り" in Path(path).name]
    if preferred:
        return preferred[0]
    if len(xlsx) == 1:
        return xlsx[0]
    ods = sorted(glob.glob("*.ods"))
    if len(ods) == 1:
        return ods[0]
    return None


def at(row: list[str], idx: int) -> str:
    return row[idx] if idx < len(row) else ""


def normalise_common(value: str) -> str:
    text = unicodedata.normalize("NFKC", value)
    text = re.sub(r"\s+", "", text)
    return text


def station_key(value: str) -> str:
    """Lookup key for a station name.

    Handles the 「横浜」/「横浜駅」 notation difference required by the spec while
    keeping 「横浜」 and 「横浜市」 strictly distinct: only a trailing 駅 is removed,
    never a 市/区/町/村 suffix.
    """
    text = normalise_common(value)
    if len(text) > 1 and text.endswith("駅"):
        text = text[:-1]
    text = text.replace("・", "").replace("･", "")
    text = text.replace("ヶ", "ケ").replace("ヵ", "ケ")
    return text


def locality_key(value: str) -> str:
    return normalise_common(value)


def locality_kind(value: str) -> str:
    text = normalise_common(value)
    if text.endswith("区"):
        return "ward"
    if text.endswith("市"):
        return "city"
    if text.endswith(("町", "村")):
        return "town"
    return "other"


def canonical_age_label(label: str) -> str:
    """Excel stores 2 as 2.0; keep the integer form used by the engine."""
    text = normalise_common(label)
    m = AGE_FLOAT_RE.match(text)
    if m:
        return m.group(1)
    return label.strip()


def parse_age(label: str) -> tuple[int, int | None] | None:
    text = normalise_common(label)
    m = AGE_FLOAT_RE.match(text)
    if m:
        value = int(m.group(1))
        return value, value
    m = AGE_RANGE_RE.match(text)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = AGE_OPEN_RE.match(text)
    if m:
        return int(m.group(1)), None
    m = AGE_EXACT_RE.match(text)
    if m:
        return int(m.group(1)), int(m.group(1))
    return None


def parse_rate(raw: str) -> tuple[float, float] | None:
    text = normalise_common(raw)
    m = RATE_RE.match(text)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def build(path: str) -> dict:
    issues: list[dict] = []

    def issue(level: str, sheet: str, code: str, message: str, **extra) -> None:
        issues.append(
            {"level": level, "sheet": sheet, "code": code, "message": message, **extra}
        )

    raw_sheets = load_sheets(path)

    for name in raw_sheets:
        if name != TEMPLATE_SHEET and name not in SHEET_LAYOUT:
            issue(
                "BLOCKER",
                name,
                "UNKNOWN_SHEET",
                "利回りシートに未知のシートがあります。列構成を確認するまで取り込めません。",
            )
    for name in SHEET_LAYOUT:
        if name not in raw_sheets:
            issue(
                "BLOCKER",
                name,
                "MISSING_SHEET",
                "想定していたシートが見つかりません。",
            )

    sheets_out: list[dict] = []
    # (station_key -> [(sheet, area)]) used to report cross-sheet ambiguity.
    station_index: dict[str, list[tuple[str, str]]] = {}
    locality_index: dict[str, list[tuple[str, str]]] = {}

    for sheet_name, layout in SHEET_LAYOUT.items():
        rows = raw_sheets.get(sheet_name)
        if not rows:
            continue

        area_codes = list(layout["rate_cols"].keys())

        # --- 築年数 x エリア の利回りレンジ ---------------------------------
        rates: list[dict] = []
        seen_ages: set[tuple[int, int | None]] = set()
        for r_idx in range(2, len(rows)):
            raw_label = at(rows[r_idx], 0)
            if not raw_label:
                continue
            label = canonical_age_label(raw_label)
            age = parse_age(raw_label)
            if age is None:
                issue(
                    "BLOCKER",
                    sheet_name,
                    "BAD_AGE_LABEL",
                    f"築年数の表記「{label}」を解釈できません。",
                    row=r_idx,
                )
                continue
            if age in seen_ages:
                issue(
                    "WARNING",
                    sheet_name,
                    "DUPLICATE_AGE",
                    f"築年数「{label}」が重複しています。",
                    row=r_idx,
                )
            seen_ages.add(age)

            by_area: dict[str, dict] = {}
            for code in area_codes:
                raw = at(rows[r_idx], layout["rate_cols"][code])
                if not raw:
                    issue(
                        "BLOCKER",
                        sheet_name,
                        "MISSING_RATE",
                        f"築年数「{label}」・{code}エリアの収益率が空欄です。",
                        row=r_idx,
                        area=code,
                    )
                    continue
                parsed = parse_rate(raw)
                if parsed is None:
                    issue(
                        "BLOCKER",
                        sheet_name,
                        "BAD_RATE_FORMAT",
                        f"築年数「{label}」・{code}エリアの収益率「{raw}」を解釈できません。",
                        row=r_idx,
                        area=code,
                    )
                    continue
                low, high = parsed
                valid = low <= high
                if not valid:
                    issue(
                        "BLOCKER",
                        sheet_name,
                        "INVERTED_RATE_RANGE",
                        f"築年数「{label}」・{code}エリアの収益率「{raw}」は下限が上限を上回っています。"
                        "正しい値をクライアントに確認するまで診断できません。",
                        row=r_idx,
                        area=code,
                    )
                by_area[code] = {
                    "low": low,
                    "high": high,
                    "raw": raw,
                    "valid": valid,
                }

            rates.append(
                {
                    "label": label,
                    "ageMin": age[0],
                    "ageMax": age[1],
                    "byArea": by_area,
                }
            )

        # --- 駅・市区町村 とエリアの対応 -------------------------------------
        stations: list[dict] = []
        localities: list[dict] = []
        seen_station: dict[str, str] = {}
        seen_locality: dict[str, str] = {}

        def add_station(name: str, area: str, column: int) -> None:
            key = station_key(name)
            if not key:
                return
            if key in seen_station:
                level = "WARNING" if seen_station[key] == area else "BLOCKER"
                issue(
                    level,
                    sheet_name,
                    "DUPLICATE_STATION",
                    f"駅名「{name}」が同一シート内で重複しています"
                    f"（{seen_station[key]}エリア / {area}エリア）。",
                    station=name,
                )
                if seen_station[key] == area:
                    return
            seen_station[key] = area
            stations.append(
                {"name": name, "key": key, "area": area, "column": column}
            )
            station_index.setdefault(key, []).append((sheet_name, area))

        def add_locality(name: str, area: str, column: int) -> None:
            key = locality_key(name)
            if not key:
                return
            if key in seen_locality:
                level = "WARNING" if seen_locality[key] == area else "BLOCKER"
                issue(
                    level,
                    sheet_name,
                    "DUPLICATE_LOCALITY",
                    f"市区町村「{name}」が同一シート内で重複しています"
                    f"（{seen_locality[key]}エリア / {area}エリア）。",
                    locality=name,
                )
                if seen_locality[key] == area:
                    return
            seen_locality[key] = area
            localities.append(
                {
                    "name": name,
                    "key": key,
                    "kind": locality_kind(name),
                    "area": area,
                    "column": column,
                }
            )
            locality_index.setdefault(key, []).append((sheet_name, area))

        for area_code, spec in layout["areas"].items():
            for col in spec.get("station_cols", []):
                for row in rows[2:]:
                    value = at(row, col)
                    if value:
                        add_station(value, area_code, col)
            for col in spec.get("locality_cols", []):
                for row in rows[2:]:
                    value = at(row, col)
                    if value:
                        add_locality(value, area_code, col)
            for col in spec.get("mixed_cols", []):
                issue(
                    "WARNING",
                    sheet_name,
                    "MIXED_STATION_LOCALITY_COLUMN",
                    f"{area_code}エリアの列(列{col})に市区町村名と駅名が混在しています"
                    "（見出しが無い、または見出しと中身が一致しない）。"
                    "接尾辞（区/市/町/村）で自動判別しています。要確認。",
                    area=area_code,
                )
                for row in rows[2:]:
                    value = at(row, col)
                    if not value:
                        continue
                    if locality_kind(value) in ("ward", "city", "town"):
                        add_locality(value, area_code, col)
                    else:
                        add_station(value, area_code, col)

        sheets_out.append(
            {
                "key": layout["key"],
                "name": sheet_name,
                "prefectures": layout["prefectures"],
                "isFallback": layout["fallback"],
                "areaCodes": area_codes,
                "defaultArea": layout["default_area"],
                "rates": rates,
                "stations": stations,
                "localities": localities,
            }
        )

    for key, hits in station_index.items():
        if len({sheet for sheet, _ in hits}) > 1:
            issue(
                "WARNING",
                "-",
                "CROSS_SHEET_STATION",
                f"駅名「{key}」が複数シートに存在します（{'、'.join(f'{s}:{a}' for s, a in hits)}）。"
                "都道府県の指定で判別します。",
                station=key,
            )
    for key, hits in locality_index.items():
        if len({sheet for sheet, _ in hits}) > 1:
            issue(
                "WARNING",
                "-",
                "CROSS_SHEET_LOCALITY",
                f"市区町村「{key}」が複数シートに存在します（{'、'.join(f'{s}:{a}' for s, a in hits)}）。"
                "都道府県の指定で判別します。",
                locality=key,
            )

    collisions = sorted(set(station_index) & set(locality_index))
    for key in collisions:
        issue(
            "WARNING",
            "-",
            "STATION_LOCALITY_SAME_NAME",
            f"「{key}」が駅名としても市区町村名としても登録されています。駅名を優先します。",
            name=key,
        )

    fallback_sheets = [s for s in sheets_out if s["isFallback"]]
    if len(fallback_sheets) != 1:
        issue(
            "BLOCKER",
            "-",
            "FALLBACK_SHEET_COUNT",
            "記載外の都道府県に適用するシートが一意に決まりません。",
        )

    return {
        "schemaVersion": 1,
        "source": path,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sheets": sheets_out,
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=None)
    parser.add_argument("--out", default="data/yield-master.json")
    args = parser.parse_args()

    source = args.source
    if source is None:
        source = find_source_spreadsheet()
        if source is None:
            print(
                "expected a 利回りシート .xlsx (preferred) or .ods in the repo root",
                file=sys.stderr,
            )
            return 1

    dataset = build(source)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(dataset, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    counts = {
        s["name"]: {
            "rates": len(s["rates"]),
            "stations": len(s["stations"]),
            "localities": len(s["localities"]),
        }
        for s in dataset["sheets"]
    }
    print(json.dumps({"out": args.out, "counts": counts}, ensure_ascii=False, indent=2))

    blockers = [i for i in dataset["issues"] if i["level"] == "BLOCKER"]
    warnings = [i for i in dataset["issues"] if i["level"] == "WARNING"]
    print(f"BLOCKER={len(blockers)} WARNING={len(warnings)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
