import { describe, expect, it } from "vitest";

import { BILLING_PLANS, isPlanKey } from "@/config/plans";
import { localityLookupKey, stationLookupKey } from "@/lib/station";

describe("駅名の正規化", () => {
  it("末尾の駅だけを除き、市は残す", () => {
    expect(stationLookupKey("横浜駅")).toBe(stationLookupKey("横浜"));
    expect(stationLookupKey("横浜市")).not.toBe(stationLookupKey("横浜"));
    expect(localityLookupKey("横浜市")).toBe("横浜市");
  });
});

describe("料金プラン", () => {
  it("確定した3プランの表示金額を持つ", () => {
    expect(BILLING_PLANS.one_time.priceYen).toBe(1100);
    expect(BILLING_PLANS.monthly_5.priceYen).toBe(2200);
    expect(BILLING_PLANS.monthly_unlimited.priceYen).toBe(5500);
    expect(BILLING_PLANS.one_time.priceLabel).toBe("1,100円 / 1回");
    expect(BILLING_PLANS.monthly_5.priceLabel).toBe("2,200円 / 月");
    expect(BILLING_PLANS.monthly_unlimited.priceLabel).toBe("5,500円 / 月");
    expect(isPlanKey("one_time")).toBe(true);
    expect(isPlanKey("nope")).toBe(false);
  });
});
