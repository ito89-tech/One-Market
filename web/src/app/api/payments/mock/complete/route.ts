import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import { isPlanKey } from "@/config/plans";
import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireUser } from "@/lib/auth";
import { isMockPaymentsAllowed } from "@/lib/env";
import { grantMockPlan } from "@/server/payments";

/**
 * Local-only stand-in for Stripe Checkout. Refused unless
 * isMockPaymentsAllowed() is true (localhost + PAYMENT_PROVIDER=mock).
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    if (!isMockPaymentsAllowed()) {
      console.warn("[payments] mock complete refused");
      return fail(
        "FORBIDDEN",
        "テスト決済はこの環境では利用できません。",
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { planKey?: unknown }
      | null;
    const planKey = isPlanKey(body?.planKey) ? body.planKey : "one_time";
    const checkoutSessionId = `mock_${randomBytes(16).toString("hex")}`;
    await grantMockPlan({
      userId: user.id,
      checkoutSessionId,
      planKey,
    });

    return ok({ next: "/checkout/success" });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
