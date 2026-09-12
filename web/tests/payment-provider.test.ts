import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "PAYMENT_PROVIDER",
  "VERCEL_ENV",
  "NEXT_PUBLIC_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_ONE_TIME",
  "STRIPE_PRICE_ID_MONTHLY_5",
  "STRIPE_PRICE_ID_MONTHLY_UNLIMITED",
  "LOCAL_TEST_PRICE_ID",
] as const;

const snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) snapshot[key] = process.env[key];
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.VERCEL_ENV = "";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.STRIPE_SECRET_KEY = "";
  process.env.STRIPE_WEBHOOK_SECRET = "";
  process.env.STRIPE_PRICE_ID = "";
  process.env.STRIPE_PRICE_ID_ONE_TIME = "";
  process.env.STRIPE_PRICE_ID_MONTHLY_5 = "";
  process.env.STRIPE_PRICE_ID_MONTHLY_UNLIMITED = "";
  process.env.LOCAL_TEST_PRICE_ID = "";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

async function loadEnv() {
  vi.resetModules();
  return import("@/lib/env");
}

describe("決済プロバイダ切替", () => {
  it("localhost + PAYMENT_PROVIDER=mock では Mock Payment を許可する", async () => {
    const { isMockPaymentsAllowed, paymentProvider, isPaidFlowEnabled } =
      await loadEnv();
    expect(isMockPaymentsAllowed()).toBe(true);
    expect(paymentProvider()).toBe("mock");
    expect(isPaidFlowEnabled()).toBe(true);
  });

  it("公開ホストでは Mock Payment を拒否する", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://onemake.example";
    const { isMockPaymentsAllowed, paymentProvider } = await loadEnv();
    expect(isMockPaymentsAllowed()).toBe(false);
    expect(paymentProvider()).toBe("none");
  });

  it("Vercel production では Mock Payment を拒否する", async () => {
    process.env.VERCEL_ENV = "production";
    const { isMockPaymentsAllowed } = await loadEnv();
    expect(isMockPaymentsAllowed()).toBe(false);
  });

  it("sk_live が設定されていると Mock Payment を拒否する", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
    const { isMockPaymentsAllowed } = await loadEnv();
    expect(isMockPaymentsAllowed()).toBe(false);
  });

  it("PAYMENT_PROVIDER が stripe でキーが揃えば stripe になる", async () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_PRICE_ID_ONE_TIME = "price_test_dummy";
    const { isMockPaymentsAllowed, paymentProvider } = await loadEnv();
    expect(isMockPaymentsAllowed()).toBe(false);
    expect(paymentProvider()).toBe("stripe");
  });

  it("localhost では LOCAL_TEST_PRICE_ID を Test Mode 用に使える", async () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.LOCAL_TEST_PRICE_ID = "price_local_temp";
    const { serverEnv, paymentProvider } = await loadEnv();
    expect(serverEnv.stripe.priceIdFor("one_time")).toBe("price_local_temp");
    expect(paymentProvider()).toBe("stripe");
  });

  it("公開ホストでは LOCAL_TEST_PRICE_ID を無視する", async () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.NEXT_PUBLIC_APP_URL = "https://onemake.example";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.LOCAL_TEST_PRICE_ID = "price_local_temp";
    const { serverEnv, paymentProvider } = await loadEnv();
    expect(serverEnv.stripe.priceIdFor("one_time")).toBe("");
    expect(paymentProvider()).toBe("none");
  });

  it("公開ホストで webhook 未設定の Stripe は有料導線を無効にする", async () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.NEXT_PUBLIC_APP_URL = "https://onemake.example";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_PRICE_ID_ONE_TIME = "price_test_dummy";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { paymentProvider, isPaidFlowEnabled } = await loadEnv();
    expect(paymentProvider()).toBe("none");
    expect(isPaidFlowEnabled()).toBe(false);
  });
});
