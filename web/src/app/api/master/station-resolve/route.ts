import type { NextRequest } from "next/server";

import { fail, internalError, ok } from "@/lib/api";
import { resolveLocationInput } from "@/server/location";

export async function GET(request: NextRequest) {
  try {
    const station = request.nextUrl.searchParams.get("station")?.trim() ?? "";
    const prefecture = request.nextUrl.searchParams.get("prefecture")?.trim() ?? "";
    const municipality =
      request.nextUrl.searchParams.get("municipality")?.trim() ?? "";
    if (!station) {
      return fail("VALIDATION_ERROR", "最寄り駅を入力してください。");
    }

    const location = await resolveLocationInput({
      station,
      prefecture,
      municipality,
    });
    return ok(location);
  } catch (error) {
    return internalError(error);
  }
}
