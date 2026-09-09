/**
 * Server-side environment access.
 *
 * Secrets are read here and nowhere else, so it is easy to verify that no
 * Stripe secret can leak into a client bundle. Anything not prefixed with
 * NEXT_PUBLIC_ is stripped from the browser build by Next.js, and importing
 * this module from a Client Component will fail the build via `server-only`.
 */
import "server-only";

import { BILLING_PLANS, type PlanKey } from "@/config/plans";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function isLocalAppUrl(): boolean {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function localOnly(value: string): string {
  if (isProductionRuntime() || !isLocalAppUrl()) return "";
  return value;
}

function stripePriceIdFor(plan: PlanKey): string {
  const named = {
    one_time: process.env.STRIPE_PRICE_ID_ONE_TIME ?? "",
    monthly_5: process.env.STRIPE_PRICE_ID_MONTHLY_5 ?? "",
    monthly_unlimited: process.env.STRIPE_PRICE_ID_MONTHLY_UNLIMITED ?? "",
  }[plan];
  if (named) return named;

  // Legacy single Price ID maps only to the one-time plan.
  if (plan === "one_time" && process.env.STRIPE_PRICE_ID) {
    return process.env.STRIPE_PRICE_ID;
  }
  if (plan === "one_time") {
    return localOnly(process.env.LOCAL_TEST_PRICE_ID ?? "");
  }
  return "";
}

function hasAnyStripePrice(): boolean {
  return (Object.keys(BILLING_PLANS) as PlanKey[]).some((key) =>
    Boolean(stripePriceIdFor(key)),
  );
}

export const serverEnv = {
  authSecret: () => required("AUTH_SECRET"),
  engineUrl: () => process.env.DIAGNOSIS_ENGINE_URL ?? "http://127.0.0.1:8000",
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  adminEmails: () =>
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  stripe: {
    secretKey: () => process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET ?? "",
    priceId: () => stripePriceIdFor("one_time"),
    priceIdFor: stripePriceIdFor,
    hasAnyPrice: hasAnyStripePrice,
    creditsPerPurchase: () =>
      Math.max(1, Number(process.env.STRIPE_CREDITS_PER_PURCHASE ?? 1) || 1),
  },
} as const;

/**
 * Mock checkout is a local-only stand-in. It cannot run against a
 * public hostname, a live Stripe secret, or Vercel production, even if
 * PAYMENT_PROVIDER=mock is set by mistake.
 */
export function isMockPaymentsAllowed(): boolean {
  if (process.env.PAYMENT_PROVIDER !== "mock") return false;
  if (isProductionRuntime()) return false;
  if (!isLocalAppUrl()) return false;
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live")) return false;
  return true;
}

export function paymentProvider(): "mock" | "stripe" | "none" {
  if (isMockPaymentsAllowed()) return "mock";
  if (serverEnv.stripe.secretKey() && serverEnv.stripe.hasAnyPrice()) {
    return "stripe";
  }
  return "none";
}

/**
 * Paid diagnosis CTA is shown when either Stripe test/live keys are complete
 * or the local mock provider is explicitly enabled.
 */
export function isPaidFlowEnabled(): boolean {
  return paymentProvider() !== "none";
}
