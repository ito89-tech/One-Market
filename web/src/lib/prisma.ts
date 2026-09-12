import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Neon のプーラー経由 URL だけ入れた場合でも、スキーマの directUrl 参照で
 * Prisma が起動時に落ちないようにする。マイグレーションは手元／ビルドで
 * DIRECT_URL を明示する運用のまま。
 */
export function ensurePrismaEnv(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = databaseUrl;
  }
}

function createPrismaClient(): PrismaClient {
  ensurePrismaEnv();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL が設定されていません");
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * 遅延初期化。モジュール読み込み時点では DATABASE_URL を要求しない。
 * （未設定のまま Vercel に載せても、トップページまでは表示できるようにする）
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
