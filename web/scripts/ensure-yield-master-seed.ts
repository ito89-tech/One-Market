/**
 * バンドル済み yield-sheet.xlsx を PostgreSQL に自動配布する。
 *
 * - 実行時の診断は常に PostgreSQL だけを見る（xlsx を都度読まない）
 * - 新しい Neon / 空 DB / 不完全なマスタならビルド時に xlsx → DB する
 * - YIELD_MASTER_SYNC_ON_DEPLOY=force なら毎回バンドル xlsx で全置換
 *   （会員・決済・診断履歴は消さない。マスタ系テーブルのみ）
 */
import "dotenv/config";

import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { applyDatabaseUrlsToEnv } from "../src/lib/database-url";

/** クライアント提供シートは 4 枚。これ未満は未投入扱いにする。 */
const MIN_SHEETS = 4;
const MIN_STATIONS = 100;

type MasterSnapshot = {
  sheets: number;
  stations: number;
  yieldRates: number;
};

async function readSnapshot(prisma: PrismaClient): Promise<MasterSnapshot> {
  const [sheets, stations, yieldRates] = await Promise.all([
    prisma.yieldSheet.count(),
    prisma.station.count(),
    prisma.yieldRate.count(),
  ]);
  return { sheets, stations, yieldRates };
}

function isComplete(snapshot: MasterSnapshot): boolean {
  return (
    snapshot.sheets >= MIN_SHEETS &&
    snapshot.stations >= MIN_STATIONS &&
    snapshot.yieldRates > 0
  );
}

function runSeedFromXlsx(): number {
  console.warn(
    "[yield-seed] バンドル xlsx（web/data/yield-sheet.xlsx）→ PostgreSQL を実行します。",
  );
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      // 本番ビルドではローカル確認用ユーザーを作らない
      SEED_LOCAL_USERS: process.env.SEED_LOCAL_USERS ?? "false",
    },
  });
  return result.status ?? 1;
}

async function main() {
  applyDatabaseUrlsToEnv();

  if (!process.env.DATABASE_URL) {
    console.warn("[yield-seed] DATABASE_URL 未設定のためスキップします。");
    return;
  }

  const force =
    process.env.YIELD_MASTER_SYNC_ON_DEPLOY === "force" ||
    process.env.YIELD_MASTER_SYNC_ON_DEPLOY === "always";

  const prisma = new PrismaClient();
  try {
    const before = await readSnapshot(prisma);
    console.log("[yield-seed] 現状:", before);

    if (!force && isComplete(before)) {
      console.log(
        "[yield-seed] マスタは投入済みのためスキップします（force にする場合は YIELD_MASTER_SYNC_ON_DEPLOY=force）。",
      );
      return;
    }

    if (force) {
      console.warn("[yield-seed] YIELD_MASTER_SYNC_ON_DEPLOY=force → バンドル xlsx で再配布します。");
    } else {
      console.warn("[yield-seed] マスタが空または不完全なため、バンドル xlsx から自動配布します。");
    }
  } catch (error) {
    console.warn(
      "[yield-seed] DB 確認に失敗しました:",
      error instanceof Error ? error.message : error,
    );
    // テーブル未作成直後などは seed 側で migrate 後に再実行される想定
    if (!process.env.VERCEL) return;
    // Vercel では確認失敗でも seed を試す
  } finally {
    await prisma.$disconnect();
  }

  const code = runSeedFromXlsx();
  if (code !== 0) {
    process.exit(code);
  }

  const verify = new PrismaClient();
  try {
    const after = await readSnapshot(verify);
    console.log("[yield-seed] 投入後:", after);
    if (!isComplete(after)) {
      console.error(
        `[yield-seed] 投入後も不完全です（sheets>=${MIN_SHEETS}, stations>=${MIN_STATIONS} が必要）。`,
      );
      if (process.env.VERCEL || process.env.ENSURE_DB_STRICT === "1") {
        process.exit(1);
      }
    }
  } finally {
    await verify.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
