/**
 * 収益率マスタが空／不完全なとき、バンドル済み xlsx を PostgreSQL に投入する。
 * 実行時の参照先は常に PostgreSQL（xlsx / JSON を診断計算に使わない）。
 *
 * サーバーやドメインが変わっても、接続先 DB が空なら初回リクエストで自動配布される。
 * 通常はビルド時 ensure-db-ready が先に投入する。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { syncYieldMasterFromBundledXlsx } from "@/server/yield-master";

const MIN_SHEETS = 4;
const MIN_STATIONS = 100;

const globalForEnsure = globalThis as unknown as {
  yieldMasterEnsure?: Promise<void>;
};

export async function ensureYieldMasterReady(): Promise<void> {
  if (!globalForEnsure.yieldMasterEnsure) {
    globalForEnsure.yieldMasterEnsure = (async () => {
      try {
        const [sheets, stations] = await Promise.all([
          prisma.yieldSheet.count(),
          prisma.station.count(),
        ]);
        if (sheets >= MIN_SHEETS && stations >= MIN_STATIONS) return;

        console.warn(
          `[yield-master] マスタ不完全（sheets=${sheets}, stations=${stations}）のため、バンドル xlsx を PostgreSQL に投入します`,
        );
        const stats = await syncYieldMasterFromBundledXlsx();
        console.warn("[yield-master] 投入完了", stats);
      } catch (error) {
        // 次回リクエストで再試行できるようにする（接続一時障害など）
        globalForEnsure.yieldMasterEnsure = undefined;
        throw error;
      }
    })();
  }

  await globalForEnsure.yieldMasterEnsure;
}
