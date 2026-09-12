import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultMasterPath,
  loadYieldMasterFromBuffer,
  loadYieldMasterFromFile,
  replaceYieldMasterInDb,
} from "../prisma/yield-master-lib";

const MASTER_PATH = path.resolve(__dirname, "..", "data", "yield-master.json");

describe("yield-master-lib", () => {
  it("web/data/yield-master.json を読み込める", () => {
    const master = loadYieldMasterFromFile(MASTER_PATH);
    expect(master.sheets.length).toBeGreaterThan(0);
    expect(master.issues).toBeInstanceOf(Array);
    expect(master.source).toBeTruthy();
    expect(defaultMasterPath(path.resolve(__dirname, ".."))).toBe(MASTER_PATH);
  });

  it("不正な JSON は拒否する", () => {
    expect(() => loadYieldMasterFromBuffer("{}")).toThrow(/sheets/);
    expect(() => loadYieldMasterFromBuffer("[]")).toThrow(/形式が不正/);
  });

  it("replaceYieldMasterInDb はマスタ系だけ再作成する", async () => {
    const createdSheets: unknown[] = [];
    const prisma = {
      yieldSheet: {
        deleteMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async ({ data }: { data: { key: string } }) => {
          const row = { id: `sheet-${data.key}`, ...data };
          createdSheets.push(row);
          return row;
        }),
        count: vi.fn(async () => createdSheets.length),
        findFirst: vi.fn(async () => ({
          sourceFile: "test.xlsx",
          generatedAt: new Date("2026-01-01T00:00:00.000Z"),
        })),
      },
      dataIssue: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0),
      },
      area: {
        create: vi.fn(async ({ data }: { data: { code: string } }) => ({
          id: `area-${data.code}`,
          ...data,
        })),
        count: vi.fn(async () => 1),
      },
      ageBracket: {
        create: vi.fn(async ({ data }: { data: { label: string } }) => ({
          id: `bracket-${data.label}`,
          ...data,
        })),
        count: vi.fn(async () => 1),
      },
      station: {
        createMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0),
      },
      municipality: {
        createMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0),
      },
      yieldRate: {
        createMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0),
      },
      user: { deleteMany: vi.fn() },
      payment: { deleteMany: vi.fn() },
    };

    const raw = readFileSync(MASTER_PATH, "utf-8");
    const full = loadYieldMasterFromBuffer(raw);
    const master = {
      ...full,
      sheets: full.sheets.slice(0, 1).map((sheet) => ({
        ...sheet,
        stations: sheet.stations.slice(0, 2),
        localities: sheet.localities.slice(0, 2),
        rates: sheet.rates.slice(0, 1),
      })),
      issues: full.issues.slice(0, 1),
    };

    const stats = await replaceYieldMasterInDb(prisma as never, master);

    expect(prisma.yieldSheet.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.dataIssue.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.yieldSheet.create).toHaveBeenCalledOnce();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    expect(prisma.payment.deleteMany).not.toHaveBeenCalled();
    expect(stats.sheets).toBe(1);
    expect(stats.source).toBe("test.xlsx");
  });
});
