import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireUser } from "@/lib/auth";
import {
  PaymentRequiredError,
  deleteAllUserDiagnoses,
  runDiagnosis,
} from "@/server/diagnosis";
import { resolveLocationInput } from "@/server/location";
import { propertyInputSchema, toFieldErrors } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    const body = await request.json().catch(() => null);
    const parsed = propertyInputSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "入力内容をご確認ください。",
        toFieldErrors(parsed.error),
      );
    }

    const location = await resolveLocationInput(parsed.data);
    if (!location.ok) {
      return fail("VALIDATION_ERROR", location.message, location.details);
    }

    const outcome = await runDiagnosis(user, {
      ...parsed.data,
      prefecture: location.prefecture || parsed.data.prefecture,
      municipality: location.municipality || parsed.data.municipality,
    });
    if (!outcome.ok) {
      return fail(
        outcome.code === "PAYMENT_REQUIRED" ? "PAYMENT_REQUIRED" : outcome.code,
        outcome.message,
      );
    }

    // Only the id: the result itself is fetched through the authorised page.
    return ok({ id: outcome.diagnosis.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (error instanceof PaymentRequiredError) {
      return fail("PAYMENT_REQUIRED", error.message);
    }
    return internalError(error);
  }
}

/** Clears the caller's own history. Entitlements are deliberately unaffected. */
export async function DELETE() {
  try {
    await assertSameOrigin();
    const user = await requireUser();

    const deleted = await deleteAllUserDiagnoses(user.id);
    return ok({ deleted });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
