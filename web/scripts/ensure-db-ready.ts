/**
 * Vercel / ローカル共通の DB 準備。
 *
 * 1. Vercel Postgres / Neon 連携の別名を DATABASE_URL / DIRECT_URL に揃える
 * 2. prisma migrate deploy（失敗時は P3005 baseline を試す）
 * 3. YieldSheet が空ならバンドル xlsx を投入
 *
 * DATABASE_URL が無いときはスキップ（ビルドを落とさない）。
 * Vercel で URL があるのに migrate が失敗したときはビルドを落とす（静かな失敗を防ぐ）。
 */
import { spawnSync } from "node:child_process";

import { applyDatabaseUrlsToEnv } from "../src/lib/database-url";

function run(label: string, command: string, args: string[], allowFail = false) {
  console.log(`[ensure-db] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const code = result.status ?? 1;
  if (code !== 0 && !allowFail) {
    process.exit(code);
  }
  return code;
}

function main() {
  const resolved = applyDatabaseUrlsToEnv();
  if (!resolved.databaseUrl) {
    console.warn(
      "[ensure-db] DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL が未設定のためスキップします。",
    );
    console.warn(
      "[ensure-db] Neon または Vercel Storage → Postgres を接続し、Redeploy してください。",
    );
    process.exit(0);
  }

  console.log(`[ensure-db] 接続ソース: ${resolved.source}`);
  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL = resolved.databaseUrl;
  }

  let migrateCode = run("migrate deploy", "npx", ["prisma", "migrate", "deploy"], true);

  if (migrateCode !== 0) {
    console.warn(
      "[ensure-db] migrate deploy が失敗したため、既存スキーマの baseline を試します。",
    );
    run(
      "migrate resolve --applied 0_init",
      "npx",
      ["prisma", "migrate", "resolve", "--applied", "0_init"],
      true,
    );
    migrateCode = run("migrate deploy (retry)", "npx", ["prisma", "migrate", "deploy"], true);
  }

  if (migrateCode !== 0) {
    console.error("[ensure-db] マイグレーションに失敗しました。");
    // Vercel で URL があるのに失敗＝本番が壊れたまま Ready になるのを防ぐ
    if (process.env.VERCEL || process.env.ENSURE_DB_STRICT === "1") {
      process.exit(migrateCode);
    }
    console.warn("[ensure-db] ローカルでは続行します（ENSURE_DB_STRICT=1 で厳格化可）。");
    process.exit(0);
  }

  run("yield-master-seed", "npx", ["tsx", "scripts/ensure-yield-master-seed.ts"]);
}

main();
