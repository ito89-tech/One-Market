/**
 * サーバー起動時の設定チェック。
 *
 * 以前は不足があると throw してサーバー全体を止めていたが、Vercel では
 * それが全ページの白い「A server error occurred」になる。ログには残しつつ
 * 起動は続行し、画面側は認証・DB を安全にフォールバックする。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Vercel が自動付与するホスト名から公開 URL を補完する
  if (!process.env.NEXT_PUBLIC_APP_URL && process.env.VERCEL_URL) {
    process.env.NEXT_PUBLIC_APP_URL = `https://${process.env.VERCEL_URL}`;
  }

  const { ensurePrismaEnv } = await import("@/lib/prisma");
  ensurePrismaEnv();

  const { describeConfigProblems } = await import("@/lib/env");
  const { fatal, warnings } = describeConfigProblems();

  for (const warning of warnings) {
    console.warn(`[config] ${warning}`);
  }
  for (const message of fatal) {
    console.error(`[config] ${message}`);
  }
}
