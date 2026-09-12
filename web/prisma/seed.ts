/**
 * 利回りシート.xlsx を直接読み、PostgreSQL に投入する。
 * Idempotent: master tables だけを入れ替え、会員・決済・診断履歴は消さない。
 */
import "dotenv/config";

import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  defaultXlsxPath,
  buildYieldMasterFromXlsxFile,
} from "./yield-xlsx";
import {
  replaceYieldMasterInDb,
} from "./yield-master-lib";

const prisma = new PrismaClient();

async function main() {
  const xlsxPath = defaultXlsxPath();
  const master = await buildYieldMasterFromXlsxFile(xlsxPath);
  const counts = await replaceYieldMasterInDb(prisma, master);

  await seedLocalUsers();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length > 0) {
    const { count } = await prisma.user.updateMany({
      where: { email: { in: adminEmails } },
      data: { role: "ADMIN" },
    });
    console.log(`管理者に昇格: ${count} 件`);
  }

  console.log(`マスタ読込: ${xlsxPath}`);
  console.log("シード完了:", counts);
}

function isLocalUserSeedAllowed(): boolean {
  if (process.env.SEED_LOCAL_USERS === "false") return false;
  if (process.env.SEED_LOCAL_USERS === "true") return true;
  return process.env.PAYMENT_PROVIDER === "mock";
}

/**
 * TEMP local accounts for walking the admin / member UI. Never created when
 * SEED_LOCAL_USERS=false. Passwords are not printed.
 */
async function seedLocalUsers() {
  if (!isLocalUserSeedAllowed()) return;

  const password = process.env.SEED_LOCAL_PASSWORD ?? "onemake-local-pass";
  const passwordHash = await bcrypt.hash(password, 12);

  const locals: Array<{
    email: string;
    role: UserRole;
    displayName: string;
    paidCredits?: number;
    markFreeUsed?: boolean;
  }> = [
    {
      email: "admin@onemake.local",
      role: "ADMIN",
      displayName: "ローカル管理者",
    },
    {
      email: "user@onemake.local",
      role: "USER",
      displayName: "ローカル利用者",
    },
    {
      email: "paid@onemake.local",
      role: "USER",
      displayName: "ローカル有料利用者",
      paidCredits: 1,
      markFreeUsed: true,
    },
  ];

  for (const local of locals) {
    await prisma.user.upsert({
      where: { email: local.email },
      create: {
        email: local.email,
        passwordHash,
        role: local.role,
        displayName: local.displayName,
        paidCredits: local.paidCredits ?? 0,
        freeDiagnosisUsedAt: local.markFreeUsed ? new Date() : null,
      },
      update: {
        passwordHash,
        role: local.role,
        displayName: local.displayName,
      },
    });
  }

  console.log("ローカル確認用ユーザーを投入しました（パスワードは README を参照）");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
