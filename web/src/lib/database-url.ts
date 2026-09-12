/**
 * PostgreSQL 接続文字列の収集・正規化。
 *
 * ローカル: PGlite（scripts/pg.ts）→ DATABASE_URL=127.0.0.1:55432
 * 本番: Neon / Vercel Postgres。統合導入時は POSTGRES_* 名になることが多い。
 */
export type ResolvedDatabaseUrls = {
  databaseUrl: string;
  directUrl: string;
  source: string;
};

function firstDefined(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Vercel / Neon 連携が付ける別名も含めて URL を拾う。 */
export function resolveDatabaseUrlsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDatabaseUrls {
  const databaseUrl = firstDefined(
    env.DATABASE_URL,
    env.POSTGRES_PRISMA_URL,
    env.POSTGRES_URL,
    env.NEON_DATABASE_URL,
    env.DATABASE_URL_POOLED,
  );

  const directUrl = firstDefined(
    env.DIRECT_URL,
    env.POSTGRES_URL_NON_POOLING,
    env.DATABASE_URL_UNPOOLED,
    env.NEON_DIRECT_URL,
    // 最後の手段: プーラー URL でも Prisma schema の directUrl 参照は満たす
    databaseUrl,
  );

  let source = "missing";
  if (env.DATABASE_URL) source = "DATABASE_URL";
  else if (env.POSTGRES_PRISMA_URL) source = "POSTGRES_PRISMA_URL";
  else if (env.POSTGRES_URL) source = "POSTGRES_URL";
  else if (env.NEON_DATABASE_URL) source = "NEON_DATABASE_URL";

  return { databaseUrl, directUrl, source };
}

/**
 * Neon / PgBouncer 向けにクエリパラメータを整える。
 * パスワード等は触らない。channel_binding=require は一部ランタイムで失敗するため外す。
 */
export function normalizeDatabaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  if (!parsed.protocol.startsWith("postgres")) return raw;

  const host = parsed.hostname.toLowerCase();
  const isNeon = host.includes("neon.tech") || host.includes("neon.db");
  const isPooler =
    host.includes("-pooler") || parsed.searchParams.get("pgbouncer") === "true";

  if (isNeon || isPooler) {
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    if (isPooler) {
      parsed.searchParams.set("pgbouncer", "true");
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "1");
      }
    }
  }

  if (parsed.searchParams.get("channel_binding") === "require") {
    parsed.searchParams.delete("channel_binding");
  }

  return parsed.toString();
}

export function isNeonDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("neon.tech") || host.includes("neon.db");
  } catch {
    return false;
  }
}

/**
 * process.env に正規化済み URL を書き戻す。
 * Prisma schema の env("DATABASE_URL") / env("DIRECT_URL") が確実に解決されるようにする。
 */
export function applyDatabaseUrlsToEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDatabaseUrls {
  const resolved = resolveDatabaseUrlsFromEnv(env);
  if (resolved.databaseUrl) {
    const normalized = normalizeDatabaseUrl(resolved.databaseUrl);
    env.DATABASE_URL = normalized;
    resolved.databaseUrl = normalized;
  }
  if (resolved.directUrl) {
    const normalizedDirect = normalizeDatabaseUrl(resolved.directUrl);
    env.DIRECT_URL = normalizedDirect;
    resolved.directUrl = normalizedDirect;
  }
  return resolved;
}

export function shouldUseNeonAdapter(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!url) return false;
  if (env.PRISMA_DISABLE_NEON_ADAPTER === "1") return false;
  if (env.VERCEL) return isNeonDatabaseUrl(url) || Boolean(env.POSTGRES_PRISMA_URL);
  return isNeonDatabaseUrl(url);
}
