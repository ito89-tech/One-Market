import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { serverEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  fulfillPaidCheckoutSession,
  upsertStripeSubscription,
} from "@/server/stripe-fulfill";

/**
 * Primary entitlement path: Stripe-signed webhook.
 * Success-page confirm is a backup when delivery is delayed.
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
      await fulfillPaidCheckoutSession(session);
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
      await upsertStripeSubscription(event.data.object as Stripe.Subscription);
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
