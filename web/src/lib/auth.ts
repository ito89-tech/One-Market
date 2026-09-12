/**
 * Session-based authentication.
 *
 * The cookie carries a 256-bit random token; the database only ever stores its
 * HMAC. A dump of the session table therefore cannot be replayed as a login.
 */
import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

import { serverEnv } from "./env";
import { prisma } from "./prisma";

const COOKIE_NAME = "onemake_session";
const SESSION_DAYS = 30;
const BCRYPT_COST = 12;

export function hashToken(token: string): string {
  return createHmac("sha256", serverEnv.authSecret()).update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    // 本番で環境変数が揃う前でもトップページを落とさない
    if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) {
      return null;
    }

    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return session.user;
  } catch (error) {
    console.error("[auth] getCurrentUser failed", error);
    return null;
  }
}

export class AuthError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("UNAUTHORIZED", "ログインが必要です");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN", "この操作を行う権限がありません");
  }
  return user;
}

/**
 * CSRF defence for state-changing endpoints. SameSite=Lax already blocks
 * cross-site POSTs from a form navigation; this closes the remaining gap for
 * requests that arrive without a matching Origin.
 */
function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^127\.0\.0\.1(?=:|$)/, "localhost")
    .replace(/^\[::1\](?=:|$)/, "localhost");
}

function hostsEquivalent(left: string, right: string): boolean {
  return normalizeHost(left) === normalizeHost(right);
}

export async function assertSameOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (!origin) return; // same-origin fetch from a server or a curl call with no Origin

  const host = headerList.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError("FORBIDDEN", "不正なリクエストです");
  }

  if (host && hostsEquivalent(originHost, host)) return;

  const configured = new URL(serverEnv.appUrl()).host;
  if (hostsEquivalent(originHost, configured)) return;

  throw new AuthError("FORBIDDEN", "不正なリクエストです");
}

/** Constant-time comparison used by the Stripe webhook fallback checks. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
