/**
 * YieldSheet が 0 件のときだけ prisma/seed.ts を実行する。
 * Vercel ビルド / 手元の Neon 投入の両方で使う。
 */
import "dotenv/config";

import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { applyDatabaseUrlsToEnv } from "../src/lib/database-url";

async function main() {
  applyDatabaseUrlsToEnv();

  if (!process.env.DATABASE_URL) {
    console.warn("[seed-if-empty] DATABASE_URL 未設定のためスキップします。");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const count = await prisma.yieldSheet.count();
    if (count > 0) {
      console.log(`[seed-if-empty] マスタ投入済み（YieldSheet=${count}）のためスキップします。`);
      return;
    }
  } catch (error) {
    console.warn(
      "[seed-if-empty] DB 確認に失敗したためスキップします:",
      error instanceof Error ? error.message : error,
    );
    return;
  } finally {
    await prisma.$disconnect();
  }

  console.warn("[seed-if-empty] マスタが空のため xlsx → PostgreSQL を実行します。");
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      SEED_LOCAL_USERS: process.env.SEED_LOCAL_USERS ?? "false",
    },
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
