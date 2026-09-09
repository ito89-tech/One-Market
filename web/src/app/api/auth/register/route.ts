import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  createSession,
  hashPassword,
} from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { registerSchema, toFieldErrors } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "入力内容をご確認ください。",
        toFieldErrors(parsed.error),
      );
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(
        "CONFLICT",
        "このメールアドレスはすでに登録されています。ログインしてください。",
        { email: "登録済みのメールアドレスです" },
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(parsed.data.password),
        displayName: parsed.data.displayName || null,
        role: serverEnv.adminEmails().includes(email) ? "ADMIN" : "USER",
      },
    });

    await createSession(user.id);
    return ok({ id: user.id, email: user.email });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
