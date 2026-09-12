import { NextResponse } from "next/server";

import { resolveDatabaseUrlsFromEnv } from "@/lib/database-url";
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
    checks.ok =
      Boolean(process.env.AUTH_SECRET) &&
      Number(checks.yieldSheets) > 0 &&
      Number(checks.stations) > 0;
    if (!process.env.AUTH_SECRET) {
      checks.hint = "AUTH_SECRET が未設定です。";
    } else if (!checks.ok) {
      checks.hint =
        "スキーマはあるがマスタが空です。ビルド時シードか /admin/data で xlsx 同期が必要です。";
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
