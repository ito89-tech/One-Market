/**
 * Diagnosis use-case layer.
 *
 * Route handlers stay thin: they authenticate, then call in here. Entitlement
 * is decided from the database row, never from anything the client sent.
 */
import "server-only";

import type { PropertyDiagnosis, Subscription, User } from "@prisma/client";

import { BILLING_PLANS } from "@/config/plans";
import { requestDiagnosis, type EngineRequest } from "@/lib/engine";
import { prisma } from "@/lib/prisma";
import type { PropertyInput } from "@/lib/validation";

export const YEN_PER_MAN = 10_000;

export type Entitlement =
  | { kind: "FREE" }
  | { kind: "PAID"; source: "credit" | "monthly_5" | "unlimited"; remaining: number | null }
  | { kind: "NONE"; reason: string };

const ACTIVE_SUB_STATUSES = ["ACTIVE", "TRIALING"] as const;

export function toEngineRequest(input: PropertyInput): EngineRequest {
  return {
    prefecture: input.prefecture,
    municipality: input.municipality,
    station: input.station,
    walkMinutes: input.walkMinutes,
    buildingAge: input.buildingAge,
    priceYen: input.priceMan * YEN_PER_MAN,
    monthlyRentYen: input.monthlyRentYen,
    managementFeeYen: input.managementFeeYen,
    repairReserveYen: input.repairReserveYen,
  };
}

export async function getUsableSubscription(
  userId: string,
): Promise<Subscription | null> {
  return prisma.subscription.findFirst({
    where: { userId, status: { in: [...ACTIVE_SUB_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

/** An active subscription is an alternative to consuming a one-off credit. */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  return (await getUsableSubscription(userId)) !== null;
}

function monthlyLimitFor(planKey: string): number | null {
  if (planKey === "monthly_5") return BILLING_PLANS.monthly_5.monthlyLimit;
  return null;
}

export async function resolveEntitlement(user: User): Promise<Entitlement> {
  if (user.freeDiagnosisUsedAt === null) return { kind: "FREE" };
  if (user.paidCredits > 0) {
    return { kind: "PAID", source: "credit", remaining: user.paidCredits };
  }

  const subscription = await getUsableSubscription(user.id);
  if (subscription) {
    const limit = monthlyLimitFor(subscription.planKey);
    if (limit === null) {
      return { kind: "PAID", source: "unlimited", remaining: null };
    }
    if (subscription.usedThisPeriod >= limit) {
      return {
        kind: "NONE",
        reason: `今月の診断回数（${limit}回）の上限に達しています。`,
      };
    }
    return {
      kind: "PAID",
      source: "monthly_5",
      remaining: limit - subscription.usedThisPeriod,
    };
  }

  return {
    kind: "NONE",
    reason: "無料診断はご利用済みです。2回目以降の診断は有料となります。",
  };
}

export type RunResult =
  | { ok: true; diagnosis: PropertyDiagnosis }
  | { ok: false; code: "PAYMENT_REQUIRED" | "DATA_UNAVAILABLE" | "ENGINE_UNAVAILABLE" | "VALIDATION_ERROR"; message: string };

export async function runDiagnosis(
  user: User,
  input: PropertyInput,
): Promise<RunResult> {
  const entitlement = await resolveEntitlement(user);
  if (entitlement.kind === "NONE") {
    return { ok: false, code: "PAYMENT_REQUIRED", message: entitlement.reason };
  }

  const engine = await requestDiagnosis(toEngineRequest(input));
  if (!engine.ok) {
    // Nothing was consumed: a data gap or an outage must not cost the user
    // their free diagnosis.
    return { ok: false, code: engine.code, message: engine.message };
  }

  const { result, internal } = engine;

  // All reads/writes in this block must go through `tx`. A nested query on
  // the outer Prisma client would need a second connection; local PGlite
  // only has one, so the interactive transaction would sit until it expired.
  const diagnosis = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction and consume conditionally, so two
    // simultaneous requests cannot both spend the same single credit.
    if (entitlement.kind === "FREE") {
      const consumed = await tx.user.updateMany({
        where: { id: user.id, freeDiagnosisUsedAt: null },
        data: { freeDiagnosisUsedAt: new Date() },
      });
      if (consumed.count === 0) {
        const paidOk = await consumePaidEntitlement(tx, user.id);
        if (!paidOk) throw new PaymentRequiredError();
      }
    } else {
      const paidOk = await consumePaidEntitlement(tx, user.id);
      if (!paidOk) throw new PaymentRequiredError();
    }

    return tx.propertyDiagnosis.create({
      data: {
        userId: user.id,
        prefecture: input.prefecture,
        municipality: input.municipality,
        stationInput: input.station,
        walkMinutes: input.walkMinutes,
        buildingAge: input.buildingAge,
        priceYen: BigInt(input.priceMan * YEN_PER_MAN),
        monthlyRentYen: BigInt(input.monthlyRentYen),
        managementFeeYen: BigInt(input.managementFeeYen),
        repairReserveYen: BigInt(input.repairReserveYen),
        judgement: result.judgement,
        marketPriceLowMan: result.marketPrice.lowMan,
        marketPriceHighMan: result.marketPrice.highMan,
        differenceLowMan: result.difference.lowMan,
        differenceHighMan: result.difference.highMan,
        sheetKey: internal.sheetKey,
        areaCode: internal.areaCode,
        matchedBy: internal.matchedBy,
        matchedValue: internal.matchedValue,
        ageBracketLabel: internal.ageBracketLabel,
        yieldPercent: internal.yieldPercent,
        rateLowPercent: internal.rateLow,
        rateHighPercent: internal.rateHigh,
        plan: entitlement.kind === "FREE" ? "FREE" : "PAID",
      },
    });
  });

  return { ok: true, diagnosis };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function consumePaidEntitlement(tx: Tx, userId: string): Promise<boolean> {
  const credit = await tx.user.updateMany({
    where: { id: userId, paidCredits: { gt: 0 } },
    data: { paidCredits: { decrement: 1 } },
  });
  if (credit.count > 0) return true;

  const subscription = await tx.subscription.findFirst({
    where: { userId, status: { in: [...ACTIVE_SUB_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) return false;

  const limit = monthlyLimitFor(subscription.planKey);
  if (limit === null) return true;

  const used = await tx.subscription.updateMany({
    where: {
      id: subscription.id,
      status: { in: [...ACTIVE_SUB_STATUSES] },
      usedThisPeriod: { lt: limit },
    },
    data: { usedThisPeriod: { increment: 1 } },
  });
  return used.count > 0;
}

export class PaymentRequiredError extends Error {
  constructor() {
    super("有料診断のご利用枠がありません");
  }
}

/** Always scoped by userId: one account can never read another's diagnosis. */
export function findUserDiagnosis(userId: string, id: string) {
  return prisma.propertyDiagnosis.findFirst({ where: { id, userId } });
}

export function listUserDiagnoses(userId: string) {
  return prisma.propertyDiagnosis.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
