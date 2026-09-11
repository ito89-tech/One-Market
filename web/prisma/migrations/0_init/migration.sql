-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Judgement" AS ENUM ('UNDERPRICED', 'FAIR', 'OVERPRICED');

-- CreateEnum
CREATE TYPE "DiagnosisPlan" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID', 'PAUSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "freeDiagnosisUsedAt" TIMESTAMP(3),
    "paidCredits" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YieldSheet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefectures" TEXT[],
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "defaultArea" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YieldSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "sourceColumn" INTEGER NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgeBracket" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "AgeBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YieldRate" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "ageBracketId" TEXT NOT NULL,
    "lowPercent" DECIMAL(6,3) NOT NULL,
    "highPercent" DECIMAL(6,3) NOT NULL,
    "raw" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "YieldRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataIssue" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDiagnosis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "stationInput" TEXT NOT NULL,
    "walkMinutes" INTEGER NOT NULL,
    "buildingAge" INTEGER NOT NULL,
    "priceYen" BIGINT NOT NULL,
    "monthlyRentYen" BIGINT NOT NULL,
    "managementFeeYen" BIGINT NOT NULL,
    "repairReserveYen" BIGINT NOT NULL,
    "judgement" "Judgement" NOT NULL,
    "marketPriceLowMan" INTEGER NOT NULL,
    "marketPriceHighMan" INTEGER NOT NULL,
    "differenceLowMan" INTEGER NOT NULL,
    "differenceHighMan" INTEGER NOT NULL,
    "sheetKey" TEXT NOT NULL,
    "areaCode" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "matchedValue" TEXT,
    "ageBracketLabel" TEXT NOT NULL,
    "yieldPercent" DECIMAL(8,4) NOT NULL,
    "rateLowPercent" DECIMAL(6,3) NOT NULL,
    "rateHighPercent" DECIMAL(6,3) NOT NULL,
    "plan" "DiagnosisPlan" NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "planKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "planKey" TEXT NOT NULL DEFAULT '',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "usedThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "YieldSheet_key_key" ON "YieldSheet"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Area_sheetId_code_key" ON "Area"("sheetId", "code");

-- CreateIndex
CREATE INDEX "Station_lookupKey_idx" ON "Station"("lookupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Station_sheetId_lookupKey_key" ON "Station"("sheetId", "lookupKey");

-- CreateIndex
CREATE INDEX "Municipality_lookupKey_idx" ON "Municipality"("lookupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_sheetId_lookupKey_key" ON "Municipality"("sheetId", "lookupKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgeBracket_sheetId_label_key" ON "AgeBracket"("sheetId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "YieldRate_sheetId_areaId_ageBracketId_key" ON "YieldRate"("sheetId", "areaId", "ageBracketId");

-- CreateIndex
CREATE INDEX "PropertyDiagnosis_userId_createdAt_idx" ON "PropertyDiagnosis"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "YieldSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "YieldSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "YieldSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgeBracket" ADD CONSTRAINT "AgeBracket_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "YieldSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRate" ADD CONSTRAINT "YieldRate_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "YieldSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRate" ADD CONSTRAINT "YieldRate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRate" ADD CONSTRAINT "YieldRate_ageBracketId_fkey" FOREIGN KEY ("ageBracketId") REFERENCES "AgeBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDiagnosis" ADD CONSTRAINT "PropertyDiagnosis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDiagnosis" ADD CONSTRAINT "PropertyDiagnosis_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

