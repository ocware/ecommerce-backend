ALTER TABLE "Product" ADD COLUMN "primaryCategoryId" UUID;

CREATE INDEX "Product_primaryCategoryId_idx" ON "Product"("primaryCategoryId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_primaryCategoryId_fkey"
  FOREIGN KEY ("primaryCategoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Product" p
SET "primaryCategoryId" = sub."categoryId"
FROM (
  SELECT DISTINCT ON (pc."productId")
    pc."productId",
    pc."categoryId"
  FROM "ProductCategory" pc
  INNER JOIN "Category" c ON c.id = pc."categoryId"
  ORDER BY pc."productId", c."position", c."name", pc."categoryId"
) AS sub
WHERE p.id = sub."productId"
  AND p."primaryCategoryId" IS NULL;
