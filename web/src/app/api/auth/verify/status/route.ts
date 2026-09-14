import { fail, internalError, ok } from "@/lib/api";
import { AuthError, createSession, readDeviceHash } from "@/lib/auth";
import { requireRuntimeSecrets } from "@/lib/prisma";
import {
  findPendingForDevice,
  findVerifiedForDevice,
  markConsumed,
} from "@/server/verification";

/**
 * Polled by the browser that started signup/login while the user goes to their
 * inbox. Once the link has been opened, the session is created here — in the
 * original browser — even if the link itself was opened on a phone.
 */
export async function GET() {
  try {
    requireRuntimeSecrets();

    const deviceHash = await readDeviceHash();
    if (!deviceHash) {
      return ok({ pending: false, signedIn: false });
    }

    const verified = await findVerifiedForDevice(deviceHash);
    if (verified) {
      await markConsumed(verified.id);
      await createSession(verified.userId);
      return ok({ pending: false, signedIn: true });
    }

    const pending = await findPendingForDevice(deviceHash);
    return ok({ pending: pending !== null, signedIn: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
