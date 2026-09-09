/**
 * First-time local setup. Run from web/: `npm run setup:local`
 *
 * Copies .env, installs the Python venv if missing, waits for PGlite,
 * then runs prisma generate / db push / seed.
 *
 * Does not start long-lived servers (use `npm run local` afterwards).
 * Does not run `stripe login` (that needs a Stripe Dashboard account).
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

import { isPortOpen, waitForPort } from "./ports";

const webDir = process.cwd();
const engineDir = path.resolve(webDir, "..", "engine");
const envPath = path.join(webDir, ".env");
const envExample = path.join(webDir, ".env.example");
const pythonVenv =
  process.platform === "win32"
    ? path.join(engineDir, ".venv", "Scripts", "python.exe")
    : path.join(engineDir, ".venv", "bin", "python");

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function ensureDb() {
  if (await isPortOpen(55432)) {
    console.log("[setup] PGlite は既に 55432 で起動しています");
    return;
  }
  console.log("[setup] PGlite を起動します（このターミナルとは別に常駐します）");
  const child = spawn("npm", ["run", "db:start"], {
    cwd: webDir,
    stdio: "ignore",
    shell: true,
    detached: true,
    windowsHide: true,
  });
  child.unref();
  await waitForPort(55432, "PGlite");
}

function ensureEnv() {
  if (existsSync(envPath)) {
    console.log("[setup] .env は既にあります");
    return;
  }
  if (!existsSync(envExample)) {
    console.error("[setup] .env.example が見つかりません");
    process.exit(1);
  }
  copyFileSync(envExample, envPath);
  console.log("[setup] .env.example を .env にコピーしました。AUTH_SECRET は必要なら差し替えてください。");
}

function ensureEngineVenv() {
  if (existsSync(pythonVenv)) {
    console.log("[setup] engine/.venv は既にあります");
    return;
  }
  console.log("[setup] engine/.venv を作成します");
  run("python", ["-m", "venv", ".venv"], engineDir);
  run(pythonVenv, ["-m", "pip", "install", "-r", "requirements.txt"], engineDir);
}

async function main() {
  console.log("[setup] Node", process.version);
  ensureEnv();
  ensureEngineVenv();
  await ensureDb();
  run("npx", ["prisma", "generate"], webDir);
  run("npx", ["prisma", "db", "push"], webDir);
  run("npx", ["tsx", "prisma/seed.ts"], webDir);
  console.log("");
  console.log("[setup] 完了。次は `npm run local` で DB / エンジン / Next.js を起動してください。");
  console.log("[setup] Stripe Test Mode は任意です。手順は README の「Stripe Test Mode」を見てください。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
