import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  createSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { databaseFailureResponse } from "@/lib/db-errors";
import { prisma, requireRuntimeSecrets } from "@/lib/prisma";
import { loginSchema, toFieldErrors } from "@/lib/validation";

/** Compared against when the account does not exist, to keep timing uniform. */
const DUMMY_HASH_PROMISE = hashPassword("onemake-timing-equaliser");

export async function POST(request: NextRequest) {
  try {
    requireRuntimeSecrets();
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

    // ADMIN_EMAILS を後から差し替えても、該当ログイン時に権限を揃えられる。
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.includes(email) && user.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
    }

    return ok({ id: user.id, email: user.email });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    const dbFailure = databaseFailureResponse(error);
    if (dbFailure) return dbFailure;
    if (error instanceof Error && /AUTH_SECRET|DATABASE_URL/.test(error.message)) {
      return fail(
        "ENGINE_UNAVAILABLE",
        "サーバー設定が完了していません。管理者に連絡してください。",
      );
    }
    return internalError(error);
  }
}
