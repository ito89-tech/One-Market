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
    isLiveMode: () => process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ?? false,
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

export type ConfigProblems = { fatal: string[]; warnings: string[] };

/**
 * Deployment sanity check.
 *
 * `fatal` covers states where the app would look healthy while doing the wrong
 * thing — most importantly charging a card without a webhook to grant what was
 * paid for. Those must stop the deploy rather than be discovered from a refund
 * request. Everything merely suspicious goes in `warnings`.
 */
export function describeConfigProblems(): ConfigProblems {
  const fatal: string[] = [];
  const warnings: string[] = [];

  const isDeployed = isProductionRuntime() || process.env.NODE_ENV === "production";
  if (!isDeployed) return { fatal, warnings };

  if (!process.env.DATABASE_URL) {
    fatal.push("DATABASE_URL が未設定です。");
  }

  const authSecret = process.env.AUTH_SECRET ?? "";
  if (!authSecret) {
    fatal.push("AUTH_SECRET が未設定です。");
  } else if (authSecret.length < 32) {
    fatal.push("AUTH_SECRET が短すぎます（32文字以上にしてください）。");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (secretKey && !process.env.STRIPE_WEBHOOK_SECRET) {
    // 付与は webhook でしか行わない。ここが欠けると決済だけ成立して
    // 診断枠が付かず、全件が返金対応になる。
    fatal.push(
      "STRIPE_SECRET_KEY があるのに STRIPE_WEBHOOK_SECRET が未設定です。決済しても診断枠が付与されません。",
    );
  }

  if (process.env.PAYMENT_PROVIDER === "mock") {
    warnings.push(
      "PAYMENT_PROVIDER=mock は本番では無視されます。stripe に変更してください。",
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) {
    fatal.push(
      "NEXT_PUBLIC_APP_URL が未設定です。決済後の戻り先と CSRF 判定に必要です。",
    );
  } else if (!appUrl.startsWith("https://")) {
    fatal.push(`NEXT_PUBLIC_APP_URL は https である必要があります（現在: ${appUrl}）。`);
  }

  if (secretKey) {
    const missing = (Object.keys(BILLING_PLANS) as PlanKey[]).filter(
      (key) => !stripePriceIdFor(key),
    );
    if (missing.length > 0) {
      warnings.push(
        `Stripe Price ID が未設定のプランがあります: ${missing.join(", ")}。該当プランは購入できません。`,
      );
    }
    if (!secretKey.startsWith("sk_live") && isProductionRuntime()) {
      warnings.push("本番環境でテストモードの Stripe キーを使用しています。");
    }
  } else {
    warnings.push(
      "STRIPE_SECRET_KEY が未設定のため、有料導線は「準備中」で表示されます。",
    );
  }

  return { fatal, warnings };
}
