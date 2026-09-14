/**
 * Email verification and device trust.
 *
 * A password alone does not create a session unless the browser is already a
 * trusted device. Anything else has to go through a link sent by email, so a
 * leaked password on its own is not enough to read someone's diagnoses.
 *
 * The link may well be opened on a different device (phone), so the token
 * records which browser started the flow: only that browser gets the session,
 * via `/api/auth/verify/status` polling.
 */
import "server-only";

import { randomBytes } from "node:crypto";
import type { EmailVerification, User, VerificationPurpose } from "@prisma/client";

import { hashToken } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { safeNext } from "@/lib/next-param";
import { prisma } from "@/lib/prisma";
import { isMailConfigured, sendMail, verificationEmail } from "@/server/mail";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Verification is only enforced once mail can actually be sent; otherwise a
 * deploy with a missing RESEND_API_KEY would lock every account out. The gap
 * is surfaced in /api/health and in the deployment warnings instead.
 */
export function isEmailVerificationEnabled(): boolean {
  return isMailConfigured();
}

export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : /Firefox\//.test(userAgent)
            ? "Firefox"
            : null;

  const platform = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : null;

  if (!browser && !platform) return null;
  return [browser, platform].filter(Boolean).join(" / ");
}

export async function isTrustedDevice(
  userId: string,
  deviceHash: string,
): Promise<boolean> {
  const device = await prisma.trustedDevice.findUnique({
    where: { userId_deviceHash: { userId, deviceHash } },
  });
  return device !== null;
}

export async function touchTrustedDevice(
  userId: string,
  deviceHash: string,
  userAgent: string | null,
): Promise<void> {
  const label = describeDevice(userAgent);
  await prisma.trustedDevice.upsert({
    where: { userId_deviceHash: { userId, deviceHash } },
    create: { userId, deviceHash, label },
    update: { lastSeenAt: new Date(), label },
  });
}

export type IssueResult =
  | { ok: true; sent: boolean; devUrl: string | null }
  | { ok: false; reason: "cooldown" | "send_failed" };

/**
 * Replaces any outstanding token for this user+device, so an old link in an
 * inbox cannot be used after a re-send.
 */
export async function issueVerification(input: {
  user: Pick<User, "id" | "email">;
  purpose: VerificationPurpose;
  deviceHash: string;
  userAgent: string | null;
  next?: string;
  respectCooldown?: boolean;
}): Promise<IssueResult> {
  if (input.respectCooldown) {
    const recent = await prisma.emailVerification.findFirst({
      where: {
        userId: input.user.id,
        deviceHash: input.deviceHash,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
    });
    if (recent) return { ok: false, reason: "cooldown" };
  }

  await prisma.emailVerification.deleteMany({
    where: {
      userId: input.user.id,
      deviceHash: input.deviceHash,
      consumedAt: null,
    },
  });

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await prisma.emailVerification.create({
    data: {
      userId: input.user.id,
      purpose: input.purpose,
      tokenHash: hashToken(token),
      deviceHash: input.deviceHash,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const destination = input.next ? safeNext(input.next, "") : "";
  const nextQuery = destination
    ? `&next=${encodeURIComponent(destination)}`
    : "";
  const url = `${serverEnv.appUrl()}/verify?token=${encodeURIComponent(token)}${nextQuery}`;
  const body = verificationEmail({
    url,
    purpose: input.purpose,
    deviceLabel: describeDevice(input.userAgent),
  });

  const sent = await sendMail({ to: input.user.email, ...body });
  if (!sent.ok && sent.reason === "send_failed") {
    return { ok: false, reason: "send_failed" };
  }

  return {
    ok: true,
    sent: sent.ok,
    // Without a mail provider the link has to be reachable somehow, but never
    // on a deployed host: that would turn the API into a free account takeover.
    devUrl: sent.ok || isProductionLike() ? null : url,
  };
}

function isProductionLike(): boolean {
  return process.env.VERCEL_ENV === "production" || Boolean(process.env.VERCEL);
}

export type ConsumeResult =
  | { ok: true; userId: string; deviceHash: string; sameDevice: boolean }
  | { ok: false; reason: "invalid" | "expired" };

/** Marks the token verified and trusts the device it was issued for. */
export async function consumeVerification(input: {
  token: string;
  callerDeviceHash: string | null;
}): Promise<ConsumeResult> {
  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: { select: { id: true, emailVerifiedAt: true } } },
  });
  if (!record || record.consumedAt) return { ok: false, reason: "invalid" };
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({
      where: { id: record.id },
      data: { verifiedAt: record.verifiedAt ?? new Date() },
    });
    if (!record.user.emailVerifiedAt) {
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
    }
    await tx.trustedDevice.upsert({
      where: {
        userId_deviceHash: {
          userId: record.userId,
          deviceHash: record.deviceHash,
        },
      },
      create: {
        userId: record.userId,
        deviceHash: record.deviceHash,
        label: describeDevice(record.userAgent),
      },
      update: { lastSeenAt: new Date() },
    });
  });

  return {
    ok: true,
    userId: record.userId,
    deviceHash: record.deviceHash,
    sameDevice: input.callerDeviceHash === record.deviceHash,
  };
}

/**
 * Polled by the browser that started the flow. Returns the record only when
 * the link has been opened, at which point the caller may create a session.
 */
export async function findVerifiedForDevice(
  deviceHash: string,
): Promise<EmailVerification | null> {
  return prisma.emailVerification.findFirst({
    where: {
      deviceHash,
      consumedAt: null,
      verifiedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function markConsumed(id: string): Promise<void> {
  await prisma.emailVerification.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
}

export async function findPendingForDevice(
  deviceHash: string,
): Promise<EmailVerification | null> {
  return prisma.emailVerification.findFirst({
    where: {
      deviceHash,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}
