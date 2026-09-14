/**
 * Shared Checkout fulfillment.
 *
 * Webhook is the primary path; the success-page confirm API is a backup when
 * Stripe's webhook is delayed or misconfigured. Both call into here so credits
 * stay idempotent on checkout session id.
 */
import "server-only";

import type Stripe from "stripe";

import { BILLING_PLANS, isPlanKey, type PlanKey } from "@/config/plans";
import { prisma } from "@/lib/prisma";
import { mapSubscriptionStatus } from "@/lib/stripe";
import { activateSubscription, grantPaidCredits } from "@/server/payments";

export type FulfillResult =
  | { ok: true; userId: string; granted: boolean }
  | { ok: false; reason: "not_paid" | "user_unresolved" };

export async function resolveCheckoutUserId(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const fromReference = session.client_reference_id ?? session.metadata?.userId;
  if (fromReference) {
    const user = await prisma.user.findUnique({ where: { id: fromReference } });
    if (user) return user.id;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) {
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
    });
    if (user) return user.id;
  }

  return null;
}

function resolvePlanKey(session: Stripe.Checkout.Session): PlanKey {
  const fromMeta = session.metadata?.planKey;
  if (isPlanKey(fromMeta)) return fromMeta;
  return session.mode === "subscription" ? "monthly_unlimited" : "one_time";
}

export function isCheckoutSessionPayable(session: Stripe.Checkout.Session): boolean {
  if (session.payment_status === "paid") return true;
  // Subscription Checkout can complete before the first invoice is marked paid.
  return session.mode === "subscription";
}

export async function fulfillPaidCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FulfillResult> {
  if (!isCheckoutSessionPayable(session)) {
    return { ok: false, reason: "not_paid" };
  }

  const userId = await resolveCheckoutUserId(session);
  if (!userId) {
    console.error("[stripe] could not resolve user for session", session.id);
    return { ok: false, reason: "user_unresolved" };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const planKey = resolvePlanKey(session);
  const credits =
    planKey === "one_time" || session.mode === "payment"
      ? BILLING_PLANS.one_time.creditsPerPurchase
      : 0;

  const { granted } = await grantPaidCredits({
    userId,
    checkoutSessionId: session.id,
    paymentIntentId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "jpy",
    credits,
    planKey,
  });

  if (session.mode === "subscription") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (subscriptionId && (planKey === "monthly_5" || planKey === "monthly_unlimited")) {
      await activateSubscription({
        userId,
        stripeSubscriptionId: subscriptionId,
        planKey,
        status: "ACTIVE",
      });
    }
  }

  return { ok: true, userId, granted };
}

export async function upsertStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!user) {
    console.error("[stripe] no user for customer", customerId);
    return;
  }

  const periodEndSeconds = subscription.items.data[0]?.current_period_end;
  const periodStartSeconds = subscription.items.data[0]?.current_period_start;
  const planKeyRaw = subscription.metadata?.planKey;
  const planKey = isPlanKey(planKeyRaw) ? planKeyRaw : "monthly_unlimited";

  await activateSubscription({
    userId: user.id,
    stripeSubscriptionId: subscription.id,
    planKey,
    status: mapSubscriptionStatus(subscription.status),
    currentPeriodStart: periodStartSeconds
      ? new Date(periodStartSeconds * 1000)
      : null,
    currentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
