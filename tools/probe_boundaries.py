"""Ad-hoc probe: judgement around the 3.19 / 3.20 / 3.39 / 3.40 boundaries."""

import json
import sys
import urllib.request
from decimal import Decimal

BASE = dict(
    prefecture="神奈川県",
    municipality="横浜市西区",
    station="横浜駅",
    walkMinutes=5,
    buildingAge=7,
    monthlyRentYen=90_000,
    managementFeeYen=7_820,
    repairReserveYen=4_260,
)

ANNUAL_NET = Decimal("935040")


def diagnose(price_man: int):
    payload = {**BASE, "priceYen": price_man * 10_000}
    request = urllib.request.Request(
        "http://127.0.0.1:8000/diagnose",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def main() -> int:
    for price_man in [2750, 2751, 2758, 2759, 2922, 2923, 2930, 2931]:
        body = diagnose(price_man)
        yield_percent = ANNUAL_NET / Decimal(price_man * 10_000) * 100
        print(
            f"{price_man}万円  yield={yield_percent:.4f}%  "
            f"rate={body['internal']['rateLow']}-{body['internal']['rateHigh']}  "
            f"judge={body['result']['judgement']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
