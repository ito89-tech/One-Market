import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  payment: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const { grantPaidCredits } = await import("@/server/payments");

beforeEach(() => {
  db.payment.findUnique.mockReset();
  db.payment.upsert.mockReset();
  db.user.update.mockReset();
  db.$transaction.mockReset();
  db.payment.findUnique.mockResolvedValue(null);
  db.payment.upsert.mockResolvedValue({});
  db.user.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
});

describe("有料診断の付与", () => {
  it("未処理のセッションでは残数を増やす", async () => {
    await expect(
      grantPaidCredits({
        userId: "user_1",
        checkoutSessionId: "cs_1",
        amount: 0,
        currency: "jpy",
        credits: 1,
      }),
    ).resolves.toEqual({ granted: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paidCredits: { increment: 1 } },
    });
  });

  it("同じセッションが既に PAID なら残数を増やさない", async () => {
    db.payment.findUnique.mockResolvedValue({ status: "PAID" });
    await expect(
      grantPaidCredits({
        userId: "user_1",
        checkoutSessionId: "cs_1",
        amount: 0,
        currency: "jpy",
        credits: 1,
      }),
    ).resolves.toEqual({ granted: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
