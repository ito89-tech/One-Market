/**
 * 収益率マスタが空のとき、バンドル済み xlsx を PostgreSQL に一度だけ投入する。
 * 実行時の参照先は常に PostgreSQL（xlsx / JSON を診断計算に使わない）。
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { syncYieldMasterFromBundledXlsx } from "@/server/yield-master";

const globalForEnsure = globalThis as unknown as {
  yieldMasterEnsure?: Promise<void>;
};

export async function ensureYieldMasterReady(): Promise<void> {
  if (!globalForEnsure.yieldMasterEnsure) {
    globalForEnsure.yieldMasterEnsure = (async () => {
      try {
        const count = await prisma.yieldSheet.count();
        if (count > 0) return;

        console.warn(
          "[yield-master] YieldSheet が空のため、バンドル済み xlsx を PostgreSQL に投入します",
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
