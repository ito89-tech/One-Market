import type { NextRequest } from "next/server";
import { headers } from "next/headers";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  createSession,
  getOrCreateDeviceHash,
  hashPassword,
} from "@/lib/auth";
import {
  databaseFailureResponse,
  isUniqueConstraintError,
} from "@/lib/db-errors";
import { serverEnv } from "@/lib/env";
import { prisma, requireRuntimeSecrets } from "@/lib/prisma";
import { optionalNext } from "@/lib/next-param";
import { registerSchema, toFieldErrors } from "@/lib/validation";
import {
  isEmailVerificationEnabled,
  issueVerification,
  touchTrustedDevice,
} from "@/server/verification";

export async function POST(request: NextRequest) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const parsed = registerSchema.safeParse(body);
    const next = optionalNext(body?.next);
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

    const verificationRequired = isEmailVerificationEnabled();
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(parsed.data.password),
        displayName: parsed.data.displayName || null,
        role: serverEnv.adminEmails().includes(email) ? "ADMIN" : "USER",
        emailVerifiedAt: verificationRequired ? null : new Date(),
      },
    });

    const deviceHash = await getOrCreateDeviceHash();
    const userAgent = (await headers()).get("user-agent");

    if (!verificationRequired) {
      await touchTrustedDevice(user.id, deviceHash, userAgent);
      await createSession(user.id);
      return ok({
        id: user.id,
        email: user.email,
        pendingVerification: false,
      });
    }

    const issued = await issueVerification({
      user,
      purpose: "SIGNUP",
      deviceHash,
      userAgent,
      next,
    });
    if (!issued.ok) {
      return fail(
        "ENGINE_UNAVAILABLE",
        "確認メールを送信できませんでした。時間をおいて再度お試しください。",
      );
    }

    return ok({
      id: user.id,
      email: user.email,
      pendingVerification: true,
      devVerifyUrl: issued.devUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    if (isUniqueConstraintError(error)) {
      return fail(
        "CONFLICT",
        "このメールアドレスはすでに登録されています。ログインしてください。",
        { email: "登録済みのメールアドレスです" },
      );
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
