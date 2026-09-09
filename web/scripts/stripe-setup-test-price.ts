import "dotenv/config";

import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY ?? "";

if (!secret) {
  console.error(
    "STRIPE_SECRET_KEY が空です。Stripe Dashboard の Test Mode キー（sk_test_）を .env に入れてください。",
  );
  process.exit(1);
}

if (!secret.startsWith("sk_test_")) {
  console.error("Test Mode のキー（sk_test_）だけを使ってください。sk_live_ は拒否します。");
  process.exit(1);
}

const PLANS = [
  {
    env: "STRIPE_PRICE_ID_ONE_TIME",
    name: "ワンマケ 1回プラン",
    description: "有料診断 1回（Test Mode）",
    unitAmount: 1100,
    recurring: false,
  },
  {
    env: "STRIPE_PRICE_ID_MONTHLY_5",
    name: "ワンマケ 月5回までプラン",
    description: "有料診断 月5回まで（Test Mode）",
    unitAmount: 2200,
    recurring: true,
  },
  {
    env: "STRIPE_PRICE_ID_MONTHLY_UNLIMITED",
    name: "ワンマケ 回数無制限プラン",
    description: "有料診断 回数無制限（Test Mode）",
    unitAmount: 5500,
    recurring: true,
  },
] as const;

async function main() {
  const stripe = new Stripe(secret);

  console.log("Test Mode の Price を作成します。表示された ID を web/.env に入れてください。");
  console.log("");

  for (const plan of PLANS) {
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { environment: "test", planEnv: plan.env },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "jpy",
      unit_amount: plan.unitAmount,
      ...(plan.recurring ? { recurring: { interval: "month" as const } } : {}),
      metadata: { environment: "test", planEnv: plan.env },
    });
    console.log(`${plan.env}=${price.id}`);
  }

  console.log("");
  console.log("次の手順:");
  console.log("  1. web/.env に PAYMENT_PROVIDER=stripe");
  console.log("  2. 上記 3 つの Price ID を設定");
  console.log("  3. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...");
  console.log("  4. npm run stripe:listen で whsec_ を STRIPE_WEBHOOK_SECRET へ");
  console.log("  5. Next.js を再起動");
  console.log("");
  console.log("本番の Live Price ID は別途発行し、同じ環境変数名で差し替えてください。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
