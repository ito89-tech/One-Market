/**
 * Loads data/yield-master.json (generated from the client's .ods) into the
 * database. Idempotent: it clears the master tables and reloads them, so
 * re-running after a data update is safe. User, diagnosis and payment data are
 * never wiped. Local confirmation users are upserted only when allowed.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MASTER_PATH = path.join(process.cwd(), "..", "data", "yield-master.json");

type RateCell = { low: number; high: number; raw: string; valid: boolean };

type Master = {
  source: string;
  generatedAt: string;
  sheets: Array<{
    key: string;
    name: string;
    prefectures: string[];
    isFallback: boolean;
    areaCodes: string[];
    defaultArea: string;
    rates: Array<{
      label: string;
      ageMin: number;
      ageMax: number | null;
      byArea: Record<string, RateCell>;
    }>;
    stations: Array<{ name: string; key: string; area: string; column: number }>;
    localities: Array<{
      name: string;
      key: string;
      kind: string;
      area: string;
      column: number;
    }>;
  }>;
  issues: Array<{ level: string; sheet: string; code: string; message: string }>;
};

async function main() {
  const master: Master = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));

  // Cascades clear Area / Station / Municipality / AgeBracket / YieldRate.
  await prisma.yieldSheet.deleteMany();
  await prisma.dataIssue.deleteMany();

  for (const sheet of master.sheets) {
    const createdSheet = await prisma.yieldSheet.create({
      data: {
        key: sheet.key,
        name: sheet.name,
        prefectures: sheet.prefectures,
        isFallback: sheet.isFallback,
        defaultArea: sheet.defaultArea,
        sourceFile: master.source,
        generatedAt: new Date(master.generatedAt),
      },
    });

    const areaIdByCode = new Map<string, string>();
    for (const [index, code] of sheet.areaCodes.entries()) {
      const area = await prisma.area.create({
        data: {
          sheetId: createdSheet.id,
          code,
          label: `${code}エリア`,
          sort: index,
        },
      });
      areaIdByCode.set(code, area.id);
    }

    const bracketIdByLabel = new Map<string, string>();
    for (const [index, row] of sheet.rates.entries()) {
      const bracket = await prisma.ageBracket.create({
        data: {
          sheetId: createdSheet.id,
          label: row.label,
          ageMin: row.ageMin,
          ageMax: row.ageMax,
          sort: index,
        },
      });
      bracketIdByLabel.set(row.label, bracket.id);
    }

    await prisma.station.createMany({
      data: sheet.stations.map((station) => ({
        sheetId: createdSheet.id,
        areaId: areaIdByCode.get(station.area)!,
        name: station.name,
        lookupKey: station.key,
        sourceColumn: station.column,
      })),
    });

    await prisma.municipality.createMany({
      data: sheet.localities.map((locality) => ({
        sheetId: createdSheet.id,
        areaId: areaIdByCode.get(locality.area)!,
        name: locality.name,
        lookupKey: locality.key,
        kind: locality.kind,
      })),
    });

    await prisma.yieldRate.createMany({
      data: sheet.rates.flatMap((row) =>
        Object.entries(row.byArea).map(([code, cell]) => ({
          sheetId: createdSheet.id,
          areaId: areaIdByCode.get(code)!,
          ageBracketId: bracketIdByLabel.get(row.label)!,
          lowPercent: cell.low,
          highPercent: cell.high,
          raw: cell.raw,
          isValid: cell.valid,
        })),
      ),
    });
  }

  await prisma.dataIssue.createMany({
    data: master.issues.map((issue) => ({
      level: issue.level,
      sheetName: issue.sheet,
      code: issue.code,
      message: issue.message,
    })),
  });

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

  const counts = {
    sheets: await prisma.yieldSheet.count(),
    areas: await prisma.area.count(),
    stations: await prisma.station.count(),
    municipalities: await prisma.municipality.count(),
    ageBrackets: await prisma.ageBracket.count(),
    yieldRates: await prisma.yieldRate.count(),
    issues: await prisma.dataIssue.count(),
  };
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
