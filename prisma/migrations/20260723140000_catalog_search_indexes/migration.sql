CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx"
  ON "Product" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ProductVariant_sku_trgm_idx"
  ON "ProductVariant" USING GIN ("sku" gin_trgm_ops);
