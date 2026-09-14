import type { NextRequest } from "next/server";
import Stripe from "stripe";

import { BILLING_PLANS, isPlanKey } from "@/config/plans";
import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireUser } from "@/lib/auth";
import { isMockPaymentsAllowed, isPaidFlowEnabled, serverEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    const body = (await request.json().catch(() => null)) as
      | { planKey?: unknown }
      | null;
    const planKey = isPlanKey(body?.planKey) ? body.planKey : null;
    if (!planKey) {
      return fail("VALIDATION_ERROR", "料金プランを選択してください。");
    }
    const plan = BILLING_PLANS[planKey];

    if (isMockPaymentsAllowed()) {
      return ok({ url: `/checkout/mock?plan=${plan.key}` });
    }

    const stripe = getStripe();
    const priceId = serverEnv.stripe.priceIdFor(plan.key);
    if (!stripe || !isPaidFlowEnabled() || !priceId) {
      return fail(
        "FORBIDDEN",
        "有料診断は現在ご利用いただけません。準備が整うまでお待ちください。",
      );
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const appUrl = serverEnv.appUrl();
    // Managed Payments がアカウント既定 ON だと、税コード未設定の Price で
    // Checkout 作成が拒否される。本サービスはホスト型 Checkout（カード／ウォレット）
    // のみ使うため、セッション単位で Managed Payments を無効化する。
    const sessionParams = {
      mode: plan.checkoutMode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      client_reference_id: user.id,
      metadata: { userId: user.id, planKey: plan.key },
      locale: "ja" as const,
      managed_payments: { enabled: false },
      // payment_method_types は指定しない。未指定にすることで Stripe
      // ダッシュボードで有効化した決済手段がそのまま使われ、Apple Pay /
      // Google Pay / Link などのウォレットが表示される。ここに
      // ["card"] を書くとウォレットが消えるので追加しないこと。
      ...(plan.checkoutMode === "subscription"
        ? {
            subscription_data: {
              metadata: { userId: user.id, planKey: plan.key },
            },
          }
        : {}),
    } as Stripe.Checkout.SessionCreateParams;

    const session = await stripe.checkout.sessions.create(sessionParams, {
      // 二重クリックで決済セッションと Payment 行が増えないようにする。
      // 分単位のバケットにしているのは、日を跨がない範囲で本当に
      // 2 回買いたい場合を塞がないため。
      idempotencyKey: `checkout:${user.id}:${plan.key}:${Math.floor(
        Date.now() / 60_000,
      )}`,
    });

    if (!session.url) {
      return fail("INTERNAL_ERROR", "決済ページを開始できませんでした。");
    }

    // 冪等キーで同じセッションが返ることがあるため upsert にする。
    await prisma.payment.upsert({
      where: { stripeCheckoutSessionId: session.id },
      create: {
        userId: user.id,
        stripeCheckoutSessionId: session.id,
        amount: session.amount_total ?? plan.priceYen,
        currency: session.currency ?? "jpy",
        status: "PENDING",
        planKey: plan.key,
      },
      update: {},
    });

    return ok({ url: session.url });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (error instanceof Stripe.errors.StripeError) {
      console.error("[stripe/checkout]", error.message);
      return fail(
        "INTERNAL_ERROR",
        "決済ページを開始できませんでした。時間をおいて再度お試しください。",
      );
    }
    return internalError(error);
  }
}
