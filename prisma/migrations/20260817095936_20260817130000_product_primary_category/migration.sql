-- DropIndex
DROP INDEX "Product_description_trgm_idx";

-- DropIndex
DROP INDEX "Product_name_trgm_idx";

-- DropIndex
DROP INDEX "ProductVariant_sku_trgm_idx";

-- AlterTable
ALTER TABLE "CustomerPasswordResetToken" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CustomerSession" ALTER COLUMN "familyId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StaffSession" ALTER COLUMN "familyId" DROP DEFAULT;
