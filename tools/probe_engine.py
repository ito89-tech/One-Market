"""Ad-hoc probe: prints how the running engine resolves a few known cases."""

import json
import sys
import urllib.request

BASE = dict(
    prefecture="神奈川県",
    municipality="横浜市西区",
    station="横浜駅",
    walkMinutes=5,
    buildingAge=7,
    priceYen=26_700_000,
    monthlyRentYen=90_000,
    managementFeeYen=7_820,
    repairReserveYen=4_260,
)

CASES = [
    ("横浜駅 / 横浜市西区", {}),
    ("未登録駅 / 横浜市", {"station": "架空ヶ丘", "municipality": "横浜市"}),
    ("武蔵小杉駅 / 川崎市", {"station": "武蔵小杉駅", "municipality": "川崎市"}),
    ("未登録駅 / 川崎市", {"station": "架空ヶ丘", "municipality": "川崎市"}),
    ("未登録駅 / 未登録市", {"station": "架空ヶ丘", "municipality": "架空市"}),
    ("渋谷駅 / 渋谷区", {"prefecture": "東京都", "municipality": "渋谷区", "station": "渋谷"}),
]


def diagnose(payload):
    request = urllib.request.Request(
        "http://127.0.0.1:8000/diagnose",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return {"httpError": error.code, "body": json.load(error)}


def main() -> int:
    for label, overrides in CASES:
        body = diagnose({**BASE, **overrides})
        if "internal" in body:
            internal = body["internal"]
            public = body["result"]
            print(
                f"{label:22} area={internal['areaCode']} "
                f"matched={internal['matchedBy']}:{internal['matchedValue']} "
                f"age={internal['ageBracketLabel']} "
                f"rate={internal['rateLow']}-{internal['rateHigh']} "
                f"market={public['marketPrice']['lowMan']}-{public['marketPrice']['highMan']}万 "
                f"judge={public['judgement']}"
            )
        else:
            print(f"{label:22} {json.dumps(body, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
