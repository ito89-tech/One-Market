"""Print the validation issues found while converting the yield sheet."""

import json
import io
import sys

data = json.load(open("data/yield-master.json", encoding="utf-8"))
out = io.StringIO()
for i in data["issues"]:
    out.write(f"[{i['level']}] {i['sheet']} / {i['code']}\n    {i['message']}\n")

out.write("\n--- sheet summary ---\n")
for s in data["sheets"]:
    out.write(
        f"{s['name']}: areas={s['areaCodes']} default={s['defaultArea']} "
        f"prefectures={s['prefectures']} fallback={s['isFallback']}\n"
    )
    for area in s["areaCodes"]:
        st = [x["name"] for x in s["stations"] if x["area"] == area]
        lo = [x["name"] for x in s["localities"] if x["area"] == area]
        out.write(f"  {area}: 駅{len(st)}件 {st}\n")
        out.write(f"  {area}: 市区町村{len(lo)}件 {lo}\n")

with open("tools/issues.txt", "w", encoding="utf-16") as fh:
    fh.write(out.getvalue())
print("written tools/issues.txt")
