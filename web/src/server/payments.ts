/**
 * Shared paid-access grant.
 *
 * Both the Stripe webhook and the local mock checkout call this. Credits are
 * incremented only the first time a checkout session id is marked PAID, so a
 * retried webhook or a double-click on the mock button cannot stack entitlements.
 */
import "server-only";

import type { SubscriptionStatus } from "@prisma/client";

import { BILLING_PLANS, type PlanKey } from "@/config/plans";
import { prisma } from "@/lib/prisma";

export async function grantPaidCredits(input: {
  userId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  amount: number;
  currency: string;
  credits: number;
  planKey?: string | null;
}): Promise<{ granted: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { stripeCheckoutSessionId: input.checkoutSessionId },
    });
    if (existing?.status === "PAID") {
      return { granted: false };
    }

    await tx.payment.upsert({
      where: { stripeCheckoutSessionId: input.checkoutSessionId },
      create: {
        userId: input.userId,
        stripeCheckoutSessionId: input.checkoutSessionId,
        stripePaymentIntentId: input.paymentIntentId ?? null,
        amount: input.amount,
        currency: input.currency,
        status: "PAID",
        creditsGranted: input.credits,
        planKey: input.planKey ?? null,
      },
      update: {
        stripePaymentIntentId: input.paymentIntentId ?? null,
        amount: input.amount,
        status: "PAID",
        creditsGranted: input.credits,
        planKey: input.planKey ?? existing?.planKey ?? null,
      },
    });

    if (input.credits > 0) {
      await tx.user.update({
        where: { id: input.userId },
        data: { paidCredits: { increment: input.credits } },
      });
    }

    return { granted: true };
  });
}

export async function activateSubscription(input: {
  userId: string;
  stripeSubscriptionId: string;
  planKey: PlanKey;
  status: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
  });

  const periodChanged =
    existing?.currentPeriodStart?.getTime() !==
    (input.currentPeriodStart?.getTime() ?? null);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
    create: {
      userId: input.userId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      status: input.status,
      planKey: input.planKey,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      usedThisPeriod: 0,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
    update: {
      status: input.status,
      planKey: input.planKey || existing?.planKey || "",
      currentPeriodStart: input.currentPeriodStart ?? existing?.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd ?? existing?.currentPeriodEnd,
      usedThisPeriod: periodChanged ? 0 : (existing?.usedThisPeriod ?? 0),
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
  });
}

export async function grantMockPlan(input: {
  userId: string;
  checkoutSessionId: string;
  planKey: PlanKey;
}): Promise<{ granted: boolean }> {
  const plan = BILLING_PLANS[input.planKey];
  const granted = await grantPaidCredits({
    userId: input.userId,
    checkoutSessionId: input.checkoutSessionId,
    paymentIntentId: null,
    amount: plan.priceYen,
    currency: "jpy",
    credits: plan.creditsPerPurchase,
    planKey: plan.key,
  });

  if (plan.checkoutMode === "subscription" && granted.granted) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await activateSubscription({
      userId: input.userId,
      stripeSubscriptionId: input.checkoutSessionId,
      planKey: plan.key,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
  }

  return granted;
}

export function getLatestPayment(userId: string) {
  return prisma.payment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true, creditsGranted: true, planKey: true },
  });
}
