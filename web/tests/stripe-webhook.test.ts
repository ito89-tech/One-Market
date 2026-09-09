import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
process.env.STRIPE_CREDITS_PER_PURCHASE = "1";

const db = {
  stripeEvent: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  subscription: { upsert: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));

const Stripe = (await import("stripe")).default;
const { getStripe, mapSubscriptionStatus } = await import("@/lib/stripe");
const { POST } = await import("@/app/api/stripe/webhook/route");

const stripe = getStripe()!;

function signedRequest(event: unknown, secret = "whsec_test_dummy") {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

function checkoutCompleted(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        mode: "payment",
        payment_status: "paid",
        client_reference_id: "user_1",
        payment_intent: "pi_test_1",
        amount_total: 3300,
        currency: "jpy",
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") {
      model.mockReset();
      continue;
    }
    for (const fn of Object.values(model)) fn.mockReset();
  }
  db.stripeEvent.findUnique.mockResolvedValue(null);
  db.stripeEvent.create.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ id: "user_1" });
  db.payment.findUnique.mockResolvedValue(null);
  db.payment.upsert.mockResolvedValue({});
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  db.subscription.upsert.mockResolvedValue({});
  db.subscription.findUnique.mockResolvedValue(null);
  db.user.update.mockResolvedValue({});
  // Run the transaction body against the same mock client.
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("Stripe Webhook", () => {
  it("署名が無いリクエストを拒否する", async () => {
    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
    expect(db.payment.upsert).not.toHaveBeenCalled();
  });

  it("署名が一致しないリクエストを拒否する", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = signedRequest(checkoutCompleted(), "whsec_someone_elses_secret");
    const response = await POST(request as never);
    expect(response.status).toBe(400);
    expect(db.payment.upsert).not.toHaveBeenCalled();
  });

  it("決済成立で有料診断の回数を付与する", async () => {
    const response = await POST(signedRequest(checkoutCompleted()) as never);

    expect(response.status).toBe(200);
    expect(db.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeCheckoutSessionId: "cs_test_1" },
        create: expect.objectContaining({ userId: "user_1", status: "PAID" }),
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paidCredits: { increment: 1 } },
    });
    expect(db.stripeEvent.create).toHaveBeenCalled();
  });

  it("同じ Checkout Session では残数を二重に付与しない", async () => {
    db.payment.findUnique.mockResolvedValue({ status: "PAID" });

    const response = await POST(signedRequest(checkoutCompleted()) as never);

    expect(response.status).toBe(200);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("同じイベントを二度受け取っても二重に付与しない", async () => {
    db.stripeEvent.findUnique.mockResolvedValue({ id: "evt_1" });

    const response = await POST(signedRequest(checkoutCompleted()) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("未払いのセッションでは権限を付与しない", async () => {
    const response = await POST(
      signedRequest(checkoutCompleted({ payment_status: "unpaid" })) as never,
    );

    expect(response.status).toBe(200);
    expect(db.payment.upsert).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("決済失敗・期限切れを記録する", async () => {
    await POST(
      signedRequest({
        id: "evt_2",
        type: "checkout.session.expired",
        data: { object: { id: "cs_test_1" } },
      }) as never,
    );

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { stripeCheckoutSessionId: "cs_test_1" },
      data: { status: "CANCELED" },
    });
  });

  it("返金を記録する", async () => {
    await POST(
      signedRequest({
        id: "evt_3",
        type: "charge.refunded",
        data: { object: { id: "ch_1", payment_intent: "pi_test_1" } },
      }) as never,
    );

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_test_1" },
      data: { status: "REFUNDED" },
    });
  });

  it("サブスクリプションの状態を保存する", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user_1" });

    await POST(
      signedRequest({
        id: "evt_4",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "past_due",
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  current_period_start: 1_700_000_000,
                  current_period_end: 1_800_000_000,
                },
              ],
            },
            metadata: { planKey: "monthly_5" },
          },
        },
      }) as never,
    );

    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: "sub_1" },
        update: expect.objectContaining({ status: "PAST_DUE" }),
      }),
    );
  });

  it("処理中に失敗したら 500 を返し、Stripe に再送させる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$transaction.mockRejectedValue(new Error("db down"));

    const response = await POST(signedRequest(checkoutCompleted()) as never);

    expect(response.status).toBe(500);
    expect(db.stripeEvent.create).not.toHaveBeenCalled();
  });
});

describe("サブスクリプション状態の対応付け", () => {
  it("Stripe の各状態を取りこぼさずに変換する", () => {
    const cases: Array<[Parameters<typeof mapSubscriptionStatus>[0], string]> = [
      ["active", "ACTIVE"],
      ["trialing", "TRIALING"],
      ["past_due", "PAST_DUE"],
      ["canceled", "CANCELED"],
      ["incomplete", "INCOMPLETE"],
      ["incomplete_expired", "INCOMPLETE_EXPIRED"],
      ["unpaid", "UNPAID"],
      ["paused", "PAUSED"],
    ];
    for (const [input, expected] of cases) {
      expect(mapSubscriptionStatus(input)).toBe(expected);
    }
  });

  it("利用可能とみなすのは ACTIVE と TRIALING だけ", () => {
    const usable = new Set(["ACTIVE", "TRIALING"]);
    expect(usable.has(mapSubscriptionStatus("past_due"))).toBe(false);
    expect(usable.has(mapSubscriptionStatus("canceled"))).toBe(false);
    expect(usable.has(mapSubscriptionStatus("incomplete"))).toBe(false);
    expect(usable.has(mapSubscriptionStatus("active"))).toBe(true);
  });
});

// 実キー未設定でも Stripe SDK が読み込めることの確認（型/初期化の回帰防止）
it("Stripe クライアントは秘密鍵があるときだけ生成される", () => {
  expect(getStripe()).toBeInstanceOf(Stripe);
});
