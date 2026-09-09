"""Dump the raw contents of the client's .ods yield sheet for analysis.

Includes covered (merged) cells so column positions stay faithful to the
original spreadsheet, and records merge spans so header grouping is visible.
"""

import glob
import io
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
T = "{%s}" % NS["table"]
O = "{%s}" % NS["office"]


def cell_text(cell):
    return "\n".join(
        "".join(p.itertext()) for p in cell.findall("text:p", NS)
    ).strip()


def read_sheet(sheet):
    """Return a list of rows, each a list of cell strings (merged cells kept)."""
    rows = []
    for row in sheet.findall("table:table-row", NS):
        rrep = int(row.get(T + "number-rows-repeated", 1))
        cells = []
        for cell in row:
            tag = cell.tag
            if tag not in (T + "table-cell", T + "covered-table-cell"):
                continue
            crep = int(cell.get(T + "number-columns-repeated", 1))
            span = int(cell.get(T + "number-columns-spanned", 1))
            txt = cell_text(cell)
            if txt and span > 1:
                txt = f"{txt}<span{span}>"
            if crep > 100:
                crep = 1
            cells.extend([txt] * crep)
        while cells and cells[-1] == "":
            cells.pop()
        if rrep > 100:
            rrep = 1
        for _ in range(rrep):
            rows.append(list(cells))
    while rows and not any(rows[-1]):
        rows.pop()
    return rows


def main():
    out = io.StringIO()
    for path in sorted(glob.glob("*.ods")):
        out.write(f"=== FILE: {path} ===\n")
        with zipfile.ZipFile(path) as zf:
            root = ET.fromstring(zf.read("content.xml"))
        for sheet in root.iter(T + "table"):
            name = sheet.get(T + "name")
            out.write(f"\n--- SHEET: {name} ---\n")
            for i, cells in enumerate(read_sheet(sheet)):
                out.write(f"R{i:03d}: {cells}\n")
    with open("tools/ods_dump.txt", "w", encoding="utf-16") as fh:
        fh.write(out.getvalue())
    print("written tools/ods_dump.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
