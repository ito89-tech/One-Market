import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const subscriptionFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findFirst: subscriptionFindFirst } },
}));

const { resolveEntitlement, toEngineRequest, YEN_PER_MAN } = await import(
  "@/server/diagnosis"
);

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user_1",
    email: "owner@example.com",
    passwordHash: "hash",
    displayName: null,
    role: "USER",
    freeDiagnosisUsedAt: null,
    paidCredits: 0,
    stripeCustomerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

beforeEach(() => {
  subscriptionFindFirst.mockReset();
  subscriptionFindFirst.mockResolvedValue(null);
});

describe("診断の利用権限", () => {
  it("初回は無料診断を使える", async () => {
    await expect(resolveEntitlement(user())).resolves.toEqual({ kind: "FREE" });
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });

  it("無料診断を使い切り、残数もサブスクもなければ有料案内になる", async () => {
    const entitlement = await resolveEntitlement(
      user({ freeDiagnosisUsedAt: new Date() }),
    );
    expect(entitlement.kind).toBe("NONE");
    if (entitlement.kind !== "NONE") return;
    expect(entitlement.reason).toContain("有料");
  });

  it("有料診断の残数があれば利用できる", async () => {
    await expect(
      resolveEntitlement(user({ freeDiagnosisUsedAt: new Date(), paidCredits: 1 })),
    ).resolves.toMatchObject({ kind: "PAID", source: "credit", remaining: 1 });
  });

  it("回数無制限プランがあれば残数0でも利用できる", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub_1",
      planKey: "monthly_unlimited",
      usedThisPeriod: 0,
      status: "ACTIVE",
    });
    await expect(
      resolveEntitlement(user({ freeDiagnosisUsedAt: new Date() })),
    ).resolves.toMatchObject({ kind: "PAID", source: "unlimited" });
  });

  it("月5回プランは5回未満なら利用できる", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub_1",
      planKey: "monthly_5",
      usedThisPeriod: 4,
      status: "ACTIVE",
    });
    await expect(
      resolveEntitlement(user({ freeDiagnosisUsedAt: new Date() })),
    ).resolves.toMatchObject({
      kind: "PAID",
      source: "monthly_5",
      remaining: 1,
    });
  });

  it("月5回プランは5回到達で6回目を拒否する", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub_1",
      planKey: "monthly_5",
      usedThisPeriod: 5,
      status: "ACTIVE",
    });
    const entitlement = await resolveEntitlement(
      user({ freeDiagnosisUsedAt: new Date() }),
    );
    expect(entitlement.kind).toBe("NONE");
    if (entitlement.kind !== "NONE") return;
    expect(entitlement.reason).toContain("5回");
  });

  it("解約済み・支払い遅延のサブスクリプションは利用権限にならない", async () => {
    subscriptionFindFirst.mockResolvedValue(null);
    const entitlement = await resolveEntitlement(
      user({ freeDiagnosisUsedAt: new Date() }),
    );
    expect(entitlement.kind).toBe("NONE");
  });
});

describe("エンジンへの受け渡し", () => {
  it("万円入力を円へ変換する", () => {
    const request = toEngineRequest({
      prefecture: "神奈川県",
      municipality: "横浜市西区",
      station: "横浜",
      priceMan: 2670,
      buildingAge: 7,
      walkMinutes: 5,
      monthlyRentYen: 90_000,
      managementFeeYen: 7_820,
      repairReserveYen: 4_260,
    });

    expect(YEN_PER_MAN).toBe(10_000);
    expect(request.priceYen).toBe(26_700_000);
    expect(request.station).toBe("横浜");
    expect(request.municipality).toBe("横浜市西区");
  });
});
