import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn(), upsert: vi.fn() },
  subscription: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const { fulfillPaidCheckoutSession, isCheckoutSessionPayable } = await import(
  "@/server/stripe-fulfill"
);

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") {
      model.mockReset();
      continue;
    }
    for (const fn of Object.values(model)) fn.mockReset();
  }
  db.user.findUnique.mockResolvedValue({ id: "user_1" });
  db.payment.findUnique.mockResolvedValue(null);
  db.payment.upsert.mockResolvedValue({});
  db.user.update.mockResolvedValue({});
  db.subscription.findUnique.mockResolvedValue(null);
  db.subscription.upsert.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
});

describe("fulfillPaidCheckoutSession", () => {
  it("未払いの一回払いは付与しない", async () => {
    const result = await fulfillPaidCheckoutSession({
      id: "cs_1",
      mode: "payment",
      payment_status: "unpaid",
      client_reference_id: "user_1",
      amount_total: 1100,
      currency: "jpy",
      metadata: { planKey: "one_time" },
    } as never);

    expect(result).toEqual({ ok: false, reason: "not_paid" });
    expect(db.payment.upsert).not.toHaveBeenCalled();
  });

  it("支払い済みならクレジットを付与する", async () => {
    const result = await fulfillPaidCheckoutSession({
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      client_reference_id: "user_1",
      payment_intent: "pi_1",
      amount_total: 1100,
      currency: "jpy",
      metadata: { planKey: "one_time", userId: "user_1" },
    } as never);

    expect(result).toEqual({ ok: true, userId: "user_1", granted: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paidCredits: { increment: 1 } },
    });
  });

  it("同じセッションでは二重付与しない", async () => {
    db.payment.findUnique.mockResolvedValue({ status: "PAID" });

    const result = await fulfillPaidCheckoutSession({
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      client_reference_id: "user_1",
      amount_total: 1100,
      currency: "jpy",
      metadata: { planKey: "one_time" },
    } as never);

    expect(result).toEqual({ ok: true, userId: "user_1", granted: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("isCheckoutSessionPayable", () => {
  it("paid または subscription を通す", () => {
    expect(
      isCheckoutSessionPayable({
        mode: "payment",
        payment_status: "paid",
      } as never),
    ).toBe(true);
    expect(
      isCheckoutSessionPayable({
        mode: "subscription",
        payment_status: "unpaid",
      } as never),
    ).toBe(true);
    expect(
      isCheckoutSessionPayable({
        mode: "payment",
        payment_status: "unpaid",
      } as never),
    ).toBe(false);
  });
});
