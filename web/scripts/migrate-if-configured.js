/**
 * Vercel ビルド用。DATABASE_URL / DIRECT_URL が揃っているときだけ
 * prisma migrate deploy を実行する。
 *
 * 環境変数未設定のまま migrate を走らせるとビルド全体が落ち、
 * 本番 URL が 404 になる。DB 準備前でも Next.js のビルド自体は
 * 成功させ、デプロイを「Ready」にするのが目的。
 */
const { spawnSync } = require("node:child_process");

const databaseUrl = process.env.DATABASE_URL ?? "";
const directUrl = process.env.DIRECT_URL ?? "";

if (!databaseUrl || !directUrl) {
  console.warn(
    "[migrate] DATABASE_URL または DIRECT_URL が未設定のため、スキーマ適用をスキップします。",
  );
  console.warn(
    "[migrate] Neon の接続文字列を Vercel の Environment Variables に入れたあと、Redeploy してください。",
  );
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
