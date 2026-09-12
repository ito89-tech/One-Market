/**
 * Prisma / DB 障害を API 向けの応答に変換する。
 * 接続不能や未マイグレーションを「処理中エラー」のまま返さない。
 */
import { Prisma } from "@prisma/client";

import { fail } from "@/lib/api";

export function isDatabaseConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name ?? "";
  const code = (error as { code?: string }).code ?? "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "PrismaClientInitializationError") return true;
  if (code === "P1001" || code === "P1000" || code === "P1017") return true;
  if (/Can't reach database server/i.test(message)) return true;
  if (/DATABASE_URL/i.test(message)) return true;
  return false;
}

export function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code ?? "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "P2021" || code === "P2010") return true;
  if (/does not exist/i.test(message) && /relation|table|column/i.test(message)) {
    return true;
  }
  return false;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export function databaseFailureResponse(error: unknown) {
  if (isDatabaseConnectivityError(error)) {
    return fail(
      "ENGINE_UNAVAILABLE",
      "データベースに接続できません。しばらく待ってから再度お試しください。",
    );
  }
  if (isSchemaMissingError(error)) {
    return fail(
      "ENGINE_UNAVAILABLE",
      "データベースの初期化が完了していません。管理者に連絡するか、しばらく待ってから再度お試しください。",
    );
  }
  return null;
}
