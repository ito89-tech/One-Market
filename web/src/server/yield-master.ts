import "server-only";

import { writeFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { clearSheetCache } from "@/server/engine/dataset";
import {
  getYieldMasterStats as getStats,
  replaceYieldMasterInDb as replaceInDb,
  type YieldMaster,
  type YieldMasterStats,
} from "../../prisma/yield-master-lib";
import {
  buildYieldMasterFromXlsx,
  buildYieldMasterFromXlsxFile,
  defaultXlsxPath,
} from "../../prisma/yield-xlsx";

export type { YieldMaster, YieldMasterStats };
export { defaultXlsxPath, buildYieldMasterFromXlsx, buildYieldMasterFromXlsxFile };

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

/** バンドル済み xlsx を直接読み、PostgreSQL に全置換する（JSON 経由なし）。 */
export async function syncYieldMasterFromBundledXlsx(
  client: PrismaClient = prisma,
): Promise<YieldMasterStats> {
  const master = await buildYieldMasterFromXlsxFile(defaultXlsxPath());
  return replaceYieldMasterInDb(master, client);
}

/** アップロードされた xlsx をパースして PostgreSQL に反映する。 */
export async function importYieldMasterFromXlsxBytes(
  xlsxBytes: Buffer,
  fileName = "upload.xlsx",
  client: PrismaClient = prisma,
): Promise<YieldMasterStats> {
  const master = await buildYieldMasterFromXlsx(xlsxBytes, fileName);

  // ローカルではバンドルも更新し、次回デプロイ用の正本を揃える。
  if (!process.env.VERCEL) {
    try {
      writeFileSync(path.join(process.cwd(), "data", "yield-sheet.xlsx"), xlsxBytes);
    } catch {
      // read-only でも取込自体は続行
    }
  }

  return replaceYieldMasterInDb(master, client);
}
