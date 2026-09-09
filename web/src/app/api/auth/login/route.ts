import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  createSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema, toFieldErrors } from "@/lib/validation";

/** Compared against when the account does not exist, to keep timing uniform. */
const DUMMY_HASH_PROMISE = hashPassword("onemake-timing-equaliser");

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();

    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "入力内容をご確認ください。",
        toFieldErrors(parsed.error),
      );
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    const matches = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? (await DUMMY_HASH_PROMISE),
    );

    // One message for both causes: do not reveal whether the account exists.
    if (!user || !matches) {
      return fail(
        "UNAUTHORIZED",
        "メールアドレスまたはパスワードが正しくありません。",
      );
    }

    await createSession(user.id);
    return ok({ id: user.id, email: user.email });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
