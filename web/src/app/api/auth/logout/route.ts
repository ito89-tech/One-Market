import { fail, internalError, ok } from "@/lib/api";
import { AuthError, assertSameOrigin, destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await assertSameOrigin();
    await destroySession();
    return ok({ loggedOut: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(error.code, error.message);
    }
    return internalError(error);
  }
}
