import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import {
  AuthError,
  assertSameOrigin,
  createSession,
  readDeviceHash,
} from "@/lib/auth";
import { requireRuntimeSecrets } from "@/lib/prisma";
import {
  consumeVerification,
  findVerifiedForDevice,
  markConsumed,
} from "@/server/verification";

/**
 * Called by the page the email link lands on.
 *
 * The token always completes verification and trusts the browser it was issued
 * for. A session is only created here when the link happens to be opened in
 * that same browser; otherwise the original browser picks it up by polling
 * `/api/auth/verify/status`.
 */
export async function POST(request: NextRequest) {
  try {
    requireRuntimeSecrets();
    await assertSameOrigin();

    const body = (await request.json().catch(() => null)) as
      | { token?: unknown }
      | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) {
      return fail("VALIDATION_ERROR", "確認リンクが正しくありません。");
    }

    const callerDeviceHash = await readDeviceHash();
    const result = await consumeVerification({ token, callerDeviceHash });
    if (!result.ok) {
      return fail(
        "VALIDATION_ERROR",
        result.reason === "expired"
          ? "確認リンクの有効期限が切れています。お手数ですが、もう一度お試しください。"
          : "確認リンクが正しくありません。すでに確認済みの可能性があります。",
      );
    }

    if (!result.sameDevice) {
      // Link opened on another device: leave the token unconsumed so the
      // waiting browser can still exchange it for a session.
      return ok({ verified: true, signedIn: false });
    }

    const pending = await findVerifiedForDevice(result.deviceHash);
    if (pending) await markConsumed(pending.id);
    await createSession(result.userId);

    return ok({ verified: true, signedIn: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
