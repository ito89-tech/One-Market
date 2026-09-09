import type { NextRequest } from "next/server";

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
    const session = await stripe.checkout.sessions.create({
      mode: plan.checkoutMode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      client_reference_id: user.id,
      metadata: { userId: user.id, planKey: plan.key },
      locale: "ja",
      ...(plan.checkoutMode === "subscription"
        ? {
            subscription_data: {
              metadata: { userId: user.id, planKey: plan.key },
            },
          }
        : {}),
    });

    if (!session.url) {
      return fail("INTERNAL_ERROR", "決済ページを開始できませんでした。");
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        stripeCheckoutSessionId: session.id,
        amount: session.amount_total ?? plan.priceYen,
        currency: session.currency ?? "jpy",
        status: "PENDING",
        planKey: plan.key,
      },
    });

    return ok({ url: session.url });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
