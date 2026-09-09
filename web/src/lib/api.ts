import { NextResponse } from "next/server";

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
};

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYMENT_REQUIRED: 402,
  DATA_UNAVAILABLE: 422,
  ENGINE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function fail(
  code: ErrorCode,
  message: string,
  details?: Record<string, string>,
) {
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code, message, details } },
    { status: ERROR_CODES[code] },
  );
}

/** Never let an internal exception message reach the client. */
export function internalError(error: unknown) {
  console.error("[api] unhandled error", error);
  return fail(
    "INTERNAL_ERROR",
    "処理中にエラーが発生しました。時間をおいて再度お試しください。",
  );
}
