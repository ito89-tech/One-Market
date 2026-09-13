/**
 * 後方互換。実体は ensure-yield-master-seed.ts。
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsx", "scripts/ensure-yield-master-seed.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
