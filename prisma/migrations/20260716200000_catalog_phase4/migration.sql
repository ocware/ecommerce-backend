CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ProductVariantStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "Brand" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "logoUrl" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "parentId" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" UUID NOT NULL,
  "brandId" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "shortDescription" TEXT,
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariant" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "status" "ProductVariantStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductPrice" (
  "id" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "compareAtAmount" DECIMAL(18,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductImage" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "variantId" UUID,
  "url" TEXT NOT NULL,
  "altText" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttribute" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttributeValue" (
  "id" UUID NOT NULL,
  "attributeId" UUID NOT NULL,
  "value" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VariantAttributeValue" (
  "variantId" UUID NOT NULL,
  "attributeValueId" UUID NOT NULL,
  CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("variantId", "attributeValueId")
);

CREATE TABLE "ProductCategory" (
  "productId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId", "categoryId")
);

CREATE TABLE "ProductCollection" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCollectionItem" (
  "collectionId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductCollectionItem_pkey" PRIMARY KEY ("collectionId", "productId")
);

CREATE TABLE "RelatedProduct" (
  "productId" UUID NOT NULL,
  "relatedProductId" UUID NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RelatedProduct_pkey" PRIMARY KEY ("productId", "relatedProductId")
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
CREATE INDEX "Brand_name_idx" ON "Brand"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "Category_isActive_position_idx" ON "Category"("isActive", "position");
CREATE INDEX "Category_name_idx" ON "Category"("name");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");
CREATE INDEX "Product_status_publishedAt_idx" ON "Product"("status", "publishedAt");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");
CREATE INDEX "ProductVariant_productId_status_idx" ON "ProductVariant"("productId", "status");
CREATE INDEX "ProductVariant_productId_position_idx" ON "ProductVariant"("productId", "position");
CREATE INDEX "ProductPrice_currency_idx" ON "ProductPrice"("currency");
CREATE UNIQUE INDEX "ProductPrice_variantId_currency_key" ON "ProductPrice"("variantId", "currency");
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");
CREATE INDEX "ProductImage_variantId_idx" ON "ProductImage"("variantId");
CREATE INDEX "ProductAttribute_productId_position_idx" ON "ProductAttribute"("productId", "position");
CREATE UNIQUE INDEX "ProductAttribute_productId_name_key" ON "ProductAttribute"("productId", "name");
CREATE INDEX "ProductAttributeValue_attributeId_position_idx" ON "ProductAttributeValue"("attributeId", "position");
CREATE UNIQUE INDEX "ProductAttributeValue_attributeId_value_key" ON "ProductAttributeValue"("attributeId", "value");
CREATE INDEX "VariantAttributeValue_attributeValueId_idx" ON "VariantAttributeValue"("attributeValueId");
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");
CREATE UNIQUE INDEX "ProductCollection_slug_key" ON "ProductCollection"("slug");
CREATE INDEX "ProductCollection_isActive_idx" ON "ProductCollection"("isActive");
CREATE INDEX "ProductCollection_name_idx" ON "ProductCollection"("name");
CREATE INDEX "ProductCollectionItem_productId_idx" ON "ProductCollectionItem"("productId");
CREATE INDEX "ProductCollectionItem_collectionId_position_idx" ON "ProductCollectionItem"("collectionId", "position");
CREATE INDEX "RelatedProduct_relatedProductId_idx" ON "RelatedProduct"("relatedProductId");
CREATE INDEX "RelatedProduct_productId_position_idx" ON "RelatedProduct"("productId", "position");

ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "ProductAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCollectionItem" ADD CONSTRAINT "ProductCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCollectionItem" ADD CONSTRAINT "ProductCollectionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelatedProduct" ADD CONSTRAINT "RelatedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelatedProduct" ADD CONSTRAINT "RelatedProduct_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
