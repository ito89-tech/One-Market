import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, requireAdmin } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/db-errors";
import { requireRuntimeSecrets } from "@/lib/prisma";
import { adminCreateUserSchema, toFieldErrors } from "@/lib/validation";
import { createUserAsAdmin } from "@/server/users";

export async function POST(request: NextRequest) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();
    await requireAdmin();

    const body = await request.json().catch(() => null);
    const parsed = adminCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "入力内容をご確認ください。",
        toFieldErrors(parsed.error),
      );
    }

    const created = await createUserAsAdmin({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName || null,
      role: parsed.data.role,
    });

    if (!created.ok) {
      return fail(
        "CONFLICT",
        "このメールアドレスはすでに登録されています。",
        { email: "登録済みのメールアドレスです" },
      );
    }

    return ok(created.user);
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (isUniqueConstraintError(error)) {
      return fail("CONFLICT", "このメールアドレスはすでに登録されています。", {
        email: "登録済みのメールアドレスです",
      });
    }
    return internalError(error);
  }
}
