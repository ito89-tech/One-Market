/**
 * Starts the FastAPI diagnosis engine from the repository's engine/.venv.
 * Run from web/: `npm run engine:start`
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const engineDir = path.resolve(process.cwd(), "..", "engine");
const python =
  process.platform === "win32"
    ? path.join(engineDir, ".venv", "Scripts", "python.exe")
    : path.join(engineDir, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(
    "engine/.venv が見つかりません。README のインストール手順で仮想環境を作ってください。",
  );
  process.exit(1);
}

const child = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
  { cwd: engineDir, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
