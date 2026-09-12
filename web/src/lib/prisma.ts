import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import {
  applyDatabaseUrlsToEnv,
  shouldUseNeonAdapter,
} from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Neon / Vercel Postgres 連携の別名を DATABASE_URL / DIRECT_URL に揃え、
 * 接続文字列を正規化する。
 */
export function ensurePrismaEnv(): void {
  applyDatabaseUrlsToEnv();
}

/** 会員・診断 API が環境不足で曖昧な 500 を出さないための事前チェック。 */
export function requireRuntimeSecrets(): void {
  ensurePrismaEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL が設定されていません");
  }
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET が設定されていません");
  }
}

function createPrismaClient(): PrismaClient {
  ensurePrismaEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL が設定されていません");
  }

  const log =
    process.env.NODE_ENV === "development"
      ? (["warn", "error"] as const)
      : (["error"] as const);

  // Vercel + Neon は TCP 直結より serverless driver（WebSocket）の方が安定する。
  if (shouldUseNeonAdapter(databaseUrl)) {
    neonConfig.webSocketConstructor = ws;
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    return new PrismaClient({ adapter, log: [...log] });
  }

  // ローカル PGlite など通常の PostgreSQL ワイヤプロトコル
  return new PrismaClient({ log: [...log] });
}

function getClient(): PrismaClient {
  ensurePrismaEnv();
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
