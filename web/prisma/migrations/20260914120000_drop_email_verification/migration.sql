-- DropTable
DROP TABLE IF EXISTS "EmailVerification";

-- DropTable
DROP TABLE IF EXISTS "TrustedDevice";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerifiedAt";

-- DropEnum
DROP TYPE IF EXISTS "VerificationPurpose";
