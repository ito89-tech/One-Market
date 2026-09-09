/**
 * Forwards Stripe Test Mode webhooks to the local Next.js app.
 * Requires the Stripe CLI (`stripe --version`) and `stripe login` once.
 *
 *   npm run stripe:listen
 *
 * Copy the printed `whsec_...` into web/.env as STRIPE_WEBHOOK_SECRET, then
 * restart Next.js. Never commit that value.
 */
import { spawn, spawnSync } from "node:child_process";

const check = spawnSync("stripe", ["--version"], { encoding: "utf8", shell: true });
if (check.status !== 0) {
  console.error(
    "Stripe CLI が見つかりません。Windows では `winget install --id Stripe.StripeCli -e` を実行してください。",
  );
  process.exit(1);
}

console.log(check.stdout.trim());
console.log("Webhook を http://localhost:3000/api/stripe/webhook へ転送します。");
console.log("表示された whsec_... を STRIPE_WEBHOOK_SECRET に入れて Next.js を再起動してください。");
console.log("");

const child = spawn(
  "stripe",
  ["listen", "--forward-to", "localhost:3000/api/stripe/webhook"],
  { stdio: "inherit", shell: true },
);

child.on("exit", (code) => process.exit(code ?? 1));
