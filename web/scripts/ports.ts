/**
 * Tiny TCP probe used by setup:local and npm run local.
 * No extra packages: Node's net is enough.
 */
import net from "node:net";

export function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function waitForPort(
  port: number,
  label: string,
  timeoutMs = 30_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${label}（ポート ${port}）が ${timeoutMs / 1000} 秒以内に起動しませんでした`);
}
