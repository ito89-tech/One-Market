import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { resolveEntitlement } from "@/server/diagnosis";
import {
  fulfillPaidCheckoutSession,
  resolveCheckoutUserId,
} from "@/server/stripe-fulfill";

/**
 * Success-page backup to the signed Stripe webhook.
 *
 * Retrieves the Checkout Session from Stripe, verifies ownership, and grants
 * paid access idempotently when the session is paid. Safe to call repeatedly.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    const body = (await request.json().catch(() => null)) as
      | { sessionId?: unknown }
      | null;
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId.startsWith("cs_")) {
      return fail("VALIDATION_ERROR", "決済セッションが見つかりません。");
    }

    const stripe = getStripe();
    if (!stripe) {
      return fail("FORBIDDEN", "決済の確認ができません。");
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      console.error("[stripe/confirm] retrieve failed", error);
      return fail("VALIDATION_ERROR", "決済セッションを確認できませんでした。");
    }

    const ownerId = await resolveCheckoutUserId(session);
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    const ownsByCustomer =
      Boolean(user.stripeCustomerId) &&
      Boolean(customerId) &&
      user.stripeCustomerId === customerId;

    if (ownerId !== user.id && !ownsByCustomer) {
      return fail("FORBIDDEN", "この決済を確認する権限がありません。");
    }

    const fulfilled = await fulfillPaidCheckoutSession(session);
    if (!fulfilled.ok) {
      return ok({
        ready: false,
        reason: fulfilled.reason,
        paymentStatus: session.payment_status,
      });
    }

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const entitlement = await resolveEntitlement(fresh);

    return ok({
      ready: entitlement.kind !== "NONE",
      granted: fulfilled.granted,
      paymentStatus: session.payment_status,
      nextDiagnosisPlan: entitlement.kind,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
