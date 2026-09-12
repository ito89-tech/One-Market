/**
 * ローカル / Vercel 共通: スキーマ適用 → 空なら xlsx シード。
 *
 * - DATABASE_URL が無いときはスキップ（ビルドを落とさない）
 * - DIRECT_URL が無いときは DATABASE_URL を流用
 * - 既存スキーマで migrate が P3005 のときは 0_init を baseline して再試行
 */
import { spawnSync } from "node:child_process";

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
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    console.warn("[ensure-db] DATABASE_URL 未設定のためスキップします。");
    process.exit(0);
  }

  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL = databaseUrl;
    console.warn("[ensure-db] DIRECT_URL 未設定のため DATABASE_URL を流用します。");
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
    console.warn(
      "[ensure-db] マイグレーションに失敗しました。続きのビルドは行いますが、会員・診断は DB 修復後に使えます。",
    );
    // Vercel ではビルド全体を落とすと 404 になるため、ここでは exit 0。
    // ローカル setup では明示的に失敗させたい場合は ENSURE_DB_STRICT=1。
    if (process.env.ENSURE_DB_STRICT === "1") {
      process.exit(migrateCode);
    }
    process.exit(0);
  }

  run("seed-if-empty", "npx", ["tsx", "scripts/seed-if-empty.ts"]);
}

main();
