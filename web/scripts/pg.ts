/**
 * Development-only PostgreSQL server.
 *
 * Runs PGlite (PostgreSQL 17 compiled to WASM) and exposes it on a TCP port
 * speaking the real PostgreSQL wire protocol, so Prisma connects with an
 * ordinary `postgresql://` URL and the schema stays identical to production.
 *
 * Why not native PostgreSQL binaries: on Windows, `postgres.exe` refuses to
 * start under an account with administrative permissions, which is the case on
 * this machine. PGlite has no such restriction and needs no system install.
 *
 * Production uses a managed PostgreSQL instance; only DATABASE_URL changes.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = Number(process.env.PGDEV_PORT ?? 55432);
const HOST = "127.0.0.1";

async function start() {
  const db = await PGlite.create({ dataDir: DATA_DIR });
  // PGlite serves every connection from one PostgreSQL session, so named
  // prepared statements are shared and two clients would collide on "s0".
  // DATABASE_URL therefore carries `pgbouncer=true`, which makes Prisma stop
  // using named prepared statements.
  const server = new PGLiteSocketServer({
    db,
    port: PORT,
    host: HOST,
    maxConnections: 10,
  });

  await server.start();
  const { rows } = await db.query<{ version: string }>("select version()");
  console.log(rows[0]?.version ?? "PostgreSQL (PGlite)");
  console.log(`起動しました: postgresql://postgres:postgres@${HOST}:${PORT}/postgres`);
  console.log("停止するには Ctrl+C");

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

async function destroy() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(".pgdata を削除しました");
}

const commands: Record<string, () => Promise<void>> = { start, destroy };
const command = process.argv[2] ?? "start";
const run = commands[command];

if (!run) {
  console.error(`未知のコマンド: ${command} (start | destroy)`);
  process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
