import { describe, expect, it } from "vitest";

import { buildYieldMasterFromXlsxFile } from "../prisma/yield-xlsx";

describe("xlsx → マスタ構造", () => {
  it("バンドル済み xlsx から4シートを読み取れる", async () => {
    const master = await buildYieldMasterFromXlsxFile();
    expect(master.sheets.map((sheet) => sheet.key).sort()).toEqual([
      "aichi_other",
      "fukuoka",
      "kanto",
      "kansai",
    ].sort());
    expect(master.sheets.every((sheet) => sheet.rates.length > 0)).toBe(true);
    expect(
      master.sheets.reduce((total, sheet) => total + sheet.stations.length, 0),
    ).toBeGreaterThan(100);
  }, 30_000);

  it("東京①・築7年は 3.20%-3.39% になる", async () => {
    const master = await buildYieldMasterFromXlsxFile();
    const kanto = master.sheets.find((sheet) => sheet.key === "kanto");
    expect(kanto).toBeTruthy();
    const age7 = kanto!.rates.find((row) => row.label === "7");
    expect(age7?.byArea["1"]).toMatchObject({
      low: 3.2,
      high: 3.39,
      valid: true,
    });
  }, 30_000);
});
