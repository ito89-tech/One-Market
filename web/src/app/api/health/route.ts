import { NextResponse } from "next/server";

import { resolveDatabaseUrlsFromEnv } from "@/lib/database-url";
import { isPaidFlowEnabled, paymentProvider } from "@/lib/env";
import { ensurePrismaEnv, prisma } from "@/lib/prisma";
import { ensureYieldMasterReady } from "@/server/ensure-yield-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * デプロイ健全性チェック。接続文字列やシークレットは返さない。
 */
export async function GET() {
  ensurePrismaEnv();
  const resolved = resolveDatabaseUrlsFromEnv();

  const stripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const stripePrices = {
    one_time: Boolean(
      process.env.STRIPE_PRICE_ID_ONE_TIME || process.env.STRIPE_PRICE_ID,
    ),
    monthly_5: Boolean(process.env.STRIPE_PRICE_ID_MONTHLY_5),
    monthly_unlimited: Boolean(process.env.STRIPE_PRICE_ID_MONTHLY_UNLIMITED),
  };

  const checks: Record<string, unknown> = {
    ok: false,
    databaseConfigured: Boolean(resolved.databaseUrl),
    databaseUrlSource: resolved.source,
    authConfigured: Boolean(process.env.AUTH_SECRET),
    directUrlConfigured: Boolean(resolved.directUrl),
    vercel: Boolean(process.env.VERCEL),
    database: "unknown",
    yieldSheets: null as number | null,
    stations: null as number | null,
    stripe: {
      secretConfigured: stripeSecret,
      webhookConfigured: stripeWebhook,
      prices: stripePrices,
      paymentProvider: paymentProvider(),
      paidFlowEnabled: isPaidFlowEnabled(),
    },
    mail: {
      configured: Boolean(process.env.RESEND_API_KEY),
      fromConfigured: Boolean(process.env.EMAIL_FROM),
      verificationEnforced: Boolean(process.env.RESEND_API_KEY),
    },
    hint: null as string | null,
  };

  if (!resolved.databaseUrl) {
    checks.database = "missing_url";
    checks.hint =
      "Vercel の Environment Variables に DATABASE_URL（Neon プーラー）を設定するか、Storage → Postgres / Neon を接続してください。";
    return NextResponse.json(checks, { status: 503 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "up";
    await ensureYieldMasterReady();
    checks.yieldSheets = await prisma.yieldSheet.count();
    checks.stations = await prisma.station.count();

    const masterOk =
      Number(checks.yieldSheets) >= 4 && Number(checks.stations) >= 100;
    const authOk = Boolean(process.env.AUTH_SECRET);
    checks.ok = authOk && masterOk;

    if (!authOk) {
      checks.hint = "AUTH_SECRET が未設定です。";
    } else if (!masterOk) {
      checks.hint =
        "収益率マスタが不完全です。再デプロイでバンドル xlsx が自動投入されます。";
    } else if (!isPaidFlowEnabled()) {
      checks.hint =
        "会員・診断は利用可能です。有料決済は Stripe の秘密鍵・Price ID・Webhook を揃えると有効になります。";
    } else if (!process.env.RESEND_API_KEY) {
      checks.hint =
        "会員・診断・決済は利用可能です。RESEND_API_KEY を入れると登録・他端末ログインのメール確認が有効になります。";
    }

    return NextResponse.json(checks, { status: checks.ok ? 200 : 503 });
  } catch (error) {
    checks.database = "down";
    checks.error = error instanceof Error ? error.message : String(error);
    checks.hint =
      "Neon のプーラー URL（-pooler）と DIRECT_URL（直結）を確認し、Redeploy してください。";
    return NextResponse.json(checks, { status: 503 });
  }
}
