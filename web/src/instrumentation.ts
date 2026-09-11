/**
 * サーバー起動時に一度だけ走る設定チェック。
 *
 * 本番の設定漏れは画面上は正常に見えてしまうため、ここで落とす。とくに
 * Stripe の webhook secret 欠落は「決済は通るが診断枠が付かない」状態を作るので、
 * 起動を止めてでも気付けるようにしている。
 */
export async function register() {
  // Edge ランタイムでは process.env の一部しか見えないため Node 側だけで検査する。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // ビルド中にも呼ばれる。ここで落とすと、環境変数が正しくてもローカルの
  // `next build` が通らなくなるので、実行時だけを対象にする。
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { describeConfigProblems } = await import("@/lib/env");
  const { fatal, warnings } = describeConfigProblems();

  for (const warning of warnings) {
    console.warn(`[config] ${warning}`);
  }

  if (fatal.length > 0) {
    const detail = fatal.map((message) => `  - ${message}`).join("\n");
    throw new Error(`本番環境の設定に不備があります:\n${detail}`);
  }
}
