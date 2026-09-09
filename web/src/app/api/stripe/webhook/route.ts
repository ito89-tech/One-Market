import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { BILLING_PLANS, isPlanKey, type PlanKey } from "@/config/plans";
import { serverEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStripe, mapSubscriptionStatus } from "@/lib/stripe";
import { activateSubscription, grantPaidCredits } from "@/server/payments";

/**
 * The only place a user gains paid access.
 *
 * Reaching the success page proves nothing; entitlement is granted here, after
 * Stripe's signature has been verified against the raw request body.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = serverEnv.stripe.webhookSecret();

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe] signature verification failed", error);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Stripe retries on any non-2xx, so the same event can arrive twice.
  const alreadyProcessed = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    console.error("[stripe] handler failed", event.type, error);
    // 500 so Stripe retries rather than silently dropping the payment.
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid" && session.mode !== "subscription") {
        return;
      }
      await grantAccess(session);
      return;
    }

    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await prisma.payment.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: {
          status: event.type === "checkout.session.expired" ? "CANCELED" : "FAILED",
        },
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertSubscription(event.data.object as Stripe.Subscription);
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      if (!charge.payment_intent) return;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent.id;
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: "REFUNDED" },
      });
      return;
    }

    default:
      return;
  }
}

async function resolveUserId(session: Stripe.Checkout.Session): Promise<string | null> {
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

async function grantAccess(session: Stripe.Checkout.Session) {
  const userId = await resolveUserId(session);
  if (!userId) {
    console.error("[stripe] could not resolve user for session", session.id);
    return;
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

  await grantPaidCredits({
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
}

function resolvePlanKey(session: Stripe.Checkout.Session): PlanKey {
  const fromMeta = session.metadata?.planKey;
  if (isPlanKey(fromMeta)) return fromMeta;
  return session.mode === "subscription" ? "monthly_unlimited" : "one_time";
}

async function upsertSubscription(subscription: Stripe.Subscription) {
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
  const planKey = isPlanKey(planKeyRaw)
    ? planKeyRaw
    : "monthly_unlimited";

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
