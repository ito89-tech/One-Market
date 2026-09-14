import type { NextRequest } from "next/server";
import { headers } from "next/headers";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  getOrCreateDeviceHash,
  verifyPassword,
} from "@/lib/auth";
import { prisma, requireRuntimeSecrets } from "@/lib/prisma";
import { optionalNext } from "@/lib/next-param";
import { loginSchema, toFieldErrors } from "@/lib/validation";
import {
  isEmailVerificationEnabled,
  issueVerification,
} from "@/server/verification";

/**
 * Re-sends the confirmation link. The password is required again so this
 * endpoint cannot be used to spam an arbitrary address.
 */
export async function POST(request: NextRequest) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const parsed = loginSchema.safeParse(body);
    const next = optionalNext(body?.next);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        "入力内容をご確認ください。",
        toFieldErrors(parsed.error),
      );
    }

    if (!isEmailVerificationEnabled()) {
      return fail("FORBIDDEN", "メール確認は現在無効です。");
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return fail(
        "UNAUTHORIZED",
        "メールアドレスまたはパスワードが正しくありません。",
      );
    }

    const deviceHash = await getOrCreateDeviceHash();
    const issued = await issueVerification({
      user,
      purpose: user.emailVerifiedAt === null ? "SIGNUP" : "NEW_DEVICE",
      deviceHash,
      userAgent: (await headers()).get("user-agent"),
      next,
      respectCooldown: true,
    });

    if (!issued.ok) {
      return fail(
        issued.reason === "cooldown" ? "CONFLICT" : "ENGINE_UNAVAILABLE",
        issued.reason === "cooldown"
          ? "確認メールは送信済みです。1分ほどお待ちください。"
          : "確認メールを送信できませんでした。時間をおいて再度お試しください。",
      );
    }

    return ok({ sent: true, devVerifyUrl: issued.devUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
