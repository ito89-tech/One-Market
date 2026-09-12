import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import { databaseFailureResponse } from "@/lib/db-errors";
import { propertyInputSchema, toFieldErrors } from "@/lib/validation";
import { resolveLocationInput } from "@/server/location";

/**
 * Validates the form without running a diagnosis, so an unauthenticated user
 * can be told about a typo before being asked to create an account. It
 * deliberately returns no market data.
 */
export async function POST(request: NextRequest) {
  try {
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

    return ok({ valid: true, location });
  } catch (error) {
    const dbFailure = databaseFailureResponse(error);
    if (dbFailure) return dbFailure;
    return internalError(error);
  }
}
