import "server-only";

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { clearSheetCache } from "@/server/engine/dataset";
import {
  defaultMasterPath,
  getYieldMasterStats as getStats,
  loadYieldMasterFromBuffer,
  loadYieldMasterFromFile,
  replaceYieldMasterInDb as replaceInDb,
  type YieldMaster,
  type YieldMasterStats,
} from "../../prisma/yield-master-lib";

export type { YieldMaster, YieldMasterStats };
export {
  defaultMasterPath,
  loadYieldMasterFromBuffer,
  loadYieldMasterFromFile,
};

export async function getYieldMasterStats(
  client: PrismaClient = prisma,
): Promise<YieldMasterStats> {
  return getStats(client);
}

export async function replaceYieldMasterInDb(
  master: YieldMaster,
  client: PrismaClient = prisma,
): Promise<YieldMasterStats> {
  const stats = await replaceInDb(client, master);
  clearSheetCache();
  return stats;
}

export async function syncYieldMasterFromBundledFile(
  client: PrismaClient = prisma,
): Promise<YieldMasterStats> {
  const master = loadYieldMasterFromFile(defaultMasterPath());
  return replaceYieldMasterInDb(master, client);
}

/**
 * Persist an uploaded xlsx and try converting via the Python build script.
 * On Vercel (no Python / tools outside web/), callers should prefer JSON upload.
 */
export function tryConvertXlsxToMaster(
  xlsxBytes: Buffer,
): { ok: true; master: YieldMaster } | { ok: false; message: string } {
  const writableRoot = process.env.VERCEL ? tmpdir() : path.join(process.cwd(), "data");
  const xlsxPath = path.join(writableRoot, "yield-sheet.xlsx");
  const outPath = path.join(writableRoot, "yield-master-upload.json");

  try {
    writeFileSync(xlsxPath, xlsxBytes);
  } catch {
    return {
      ok: false,
      message:
        "xlsx を保存できませんでした。Vercel では JSON（python tools/build_yield_dataset.py の出力）をアップロードしてください。",
    };
  }

  // Prefer writing into web/data when the filesystem allows it (local / persistent).
  if (!process.env.VERCEL) {
    try {
      writeFileSync(path.join(process.cwd(), "data", "yield-sheet.xlsx"), xlsxBytes);
    } catch {
      // non-fatal; tmp copy is enough for conversion
    }
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const scriptPath = path.join(repoRoot, "tools", "build_yield_dataset.py");
  const result = spawnSync(
    process.env.PYTHON ?? "python",
    [scriptPath, "--source", xlsxPath, "--out", outPath],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 60_000,
    },
  );

  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "").trim();
    return {
      ok: false,
      message:
        "xlsx の変換に失敗しました。ローカルで `python tools/build_yield_dataset.py` を実行し、生成された yield-master.json をアップロードしてください。" +
        (detail ? `（詳細: ${detail.slice(0, 400)}）` : ""),
    };
  }

  try {
    const master = loadYieldMasterFromFile(outPath);
    // Keep web/data/yield-master.json in sync when writable (local).
    if (!process.env.VERCEL) {
      try {
        writeFileSync(
          path.join(process.cwd(), "data", "yield-master.json"),
          JSON.stringify(master, null, 2) + "\n",
          "utf-8",
        );
      } catch {
        // ignore
      }
    }
    return { ok: true, master };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "変換後の JSON を読み込めませんでした。JSON を直接アップロードしてください。",
    };
  }
}
