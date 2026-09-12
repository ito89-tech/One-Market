/**
 * 後方互換。実体は ensure-db-ready.ts（DIRECT_URL 補完・P3005 baseline・空なら xlsx シード）。
 */
const { spawnSync } = require("node:child_process");

const result = spawnSync("npx", ["tsx", "scripts/ensure-db-ready.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
