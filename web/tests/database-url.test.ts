import { describe, expect, it } from "vitest";

import {
  normalizeDatabaseUrl,
  resolveDatabaseUrlsFromEnv,
  shouldUseNeonAdapter,
} from "@/lib/database-url";

describe("database-url", () => {
  it("POSTGRES_PRISMA_URL を DATABASE_URL の別名として拾う", () => {
    const resolved = resolveDatabaseUrlsFromEnv({
      POSTGRES_PRISMA_URL:
        "postgresql://u:p@ep-x-pooler.ap-northeast-1.aws.neon.tech/neondb?sslmode=require",
      POSTGRES_URL_NON_POOLING:
        "postgresql://u:p@ep-x.ap-northeast-1.aws.neon.tech/neondb?sslmode=require",
    } as unknown as NodeJS.ProcessEnv);

    expect(resolved.source).toBe("POSTGRES_PRISMA_URL");
    expect(resolved.databaseUrl).toContain("-pooler");
    expect(resolved.directUrl).not.toContain("-pooler");
  });

  it("channel_binding=require を除去し pooler 向けパラメータを補う", () => {
    const normalized = normalizeDatabaseUrl(
      "postgresql://u:p@ep-x-pooler.aws.neon.tech/db?channel_binding=require",
    );
    expect(normalized).not.toContain("channel_binding");
    expect(normalized).toContain("pgbouncer=true");
    expect(normalized).toContain("sslmode=require");
  });

  it("Neon URL ではアダプタを使う", () => {
    expect(
      shouldUseNeonAdapter("postgresql://u:p@ep-x.aws.neon.tech/db", {
        VERCEL: "1",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      shouldUseNeonAdapter(
        "postgresql://postgres:postgres@127.0.0.1:55432/postgres",
        {} as unknown as NodeJS.ProcessEnv,
      ),
    ).toBe(false);
  });
});
