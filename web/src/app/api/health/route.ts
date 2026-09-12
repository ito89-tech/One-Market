import { NextResponse } from "next/server";

import { ensurePrismaEnv } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import { ensureYieldMasterReady } from "@/server/ensure-yield-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * デプロイ健全性チェック。シークレットは返さない。
 */
export async function GET() {
  ensurePrismaEnv();

  const checks: Record<string, unknown> = {
    ok: false,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    authConfigured: Boolean(process.env.AUTH_SECRET),
    directUrlConfigured: Boolean(process.env.DIRECT_URL || process.env.DATABASE_URL),
    database: "unknown",
    yieldSheets: null as number | null,
    stations: null as number | null,
  };

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ...checks, ok: false, database: "missing_url" },
      { status: 503 },
    );
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
    return NextResponse.json(checks, { status: checks.ok ? 200 : 503 });
  } catch (error) {
    checks.database = "down";
    checks.error = error instanceof Error ? error.message : String(error);
    return NextResponse.json(checks, { status: 503 });
  }
}
