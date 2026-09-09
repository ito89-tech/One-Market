import { fail, internalError, ok } from "@/lib/api";
import { AuthError, requireUser } from "@/lib/auth";
import { isPaidFlowEnabled } from "@/lib/env";
import { hasActiveSubscription, resolveEntitlement } from "@/server/diagnosis";

export async function GET() {
  try {
    const user = await requireUser();
    const entitlement = await resolveEntitlement(user);

    return ok({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      usage: {
        freeDiagnosisUsed: user.freeDiagnosisUsedAt !== null,
        freeDiagnosisUsedAt: user.freeDiagnosisUsedAt,
        paidCredits: user.paidCredits,
        subscriptionActive: await hasActiveSubscription(user.id),
        canDiagnose: entitlement.kind !== "NONE",
        nextDiagnosisPlan: entitlement.kind,
      },
      paidFlowEnabled: isPaidFlowEnabled(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
