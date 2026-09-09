/**
 * One-command local stack: PGlite + FastAPI + Next.js.
 * Run from web/: `npm run local`
 *
 * Existing processes on 55432 / 8000 / 3000 are reused instead of duplicated.
 * Ctrl+C stops only the children this script started.
 */
import { type ChildProcess, spawn } from "node:child_process";

import { isPortOpen, waitForPort } from "./ports";

const children: ChildProcess[] = [];

function start(label: string, command: string, args: string[]) {
  console.log(`[${label}] 起動: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, { stdio: "inherit", shell: true });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[${label}] 終了コード ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed && child.pid) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!(await isPortOpen(55432))) {
    start("db", "npm", ["run", "db:start"]);
    await waitForPort(55432, "PGlite");
  } else {
    console.log("[db] 55432 は既に使用中なので再利用します");
  }

  if (!(await isPortOpen(8000))) {
    start("engine", "npm", ["run", "engine:start"]);
    await waitForPort(8000, "診断エンジン");
  } else {
    console.log("[engine] 8000 は既に使用中なので再利用します");
  }

  if (!(await isPortOpen(3000))) {
    start("web", "npm", ["run", "dev"]);
    await waitForPort(3000, "Next.js");
  } else {
    console.log("[web] 3000 は既に使用中なので再利用します");
    console.log("[web] http://localhost:3000 を開いてください");
    if (children.length === 0) {
      return;
    }
  }

  console.log("");
  console.log("ローカル起動: http://localhost:3000");
  console.log("停止: Ctrl+C");
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
