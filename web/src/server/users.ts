/**
 * Admin user administration.
 *
 * Deletion is destructive on purpose: sessions, diagnoses, payments and
 * subscriptions all cascade from `User`, so a removed account leaves no
 * readable history behind. The guards below are what stop an admin from
 * locking everyone (including themselves) out of the admin area.
 */
import "server-only";

import type { User, UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CreateUserResult =
  | { ok: true; user: Pick<User, "id" | "email" | "role"> }
  | { ok: false; reason: "email_taken" };

export async function createUserAsAdmin(input: {
  email: string;
  password: string;
  displayName?: string | null;
  role: UserRole;
}): Promise<CreateUserResult> {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, reason: "email_taken" };

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName || null,
      role: input.role,
    },
    select: { id: true, email: true, role: true },
  });

  return { ok: true, user };
}

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "self" | "last_admin" };

export async function deleteUserAsAdmin(input: {
  actorId: string;
  targetId: string;
}): Promise<DeleteUserResult> {
  if (input.actorId === input.targetId) return { ok: false, reason: "self" };

  const target = await prisma.user.findUnique({
    where: { id: input.targetId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, reason: "not_found" };

  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return { ok: false, reason: "last_admin" };
  }

  await prisma.user.delete({ where: { id: target.id } });
  return { ok: true };
}
