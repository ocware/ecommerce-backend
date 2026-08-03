CREATE TYPE "CmsPageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "CmsHome" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "heroTitle" TEXT NOT NULL,
  "heroSubtitle" TEXT,
  "featuredProductIds" JSONB NOT NULL,
  "featuredCategorySlugs" JSONB NOT NULL,
  "promoTitle" TEXT,
  "promoBody" TEXT,
  "promoLinkUrl" TEXT,
  "updatedByStaffUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CmsHome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CmsHomeSlide" (
  "id" UUID NOT NULL,
  "homeId" TEXT NOT NULL DEFAULT 'default',
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "imageUrl" TEXT NOT NULL,
  "linkUrl" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedByStaffUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CmsHomeSlide_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CmsHomeSlide_position_check" CHECK ("position" >= 0),
  CONSTRAINT "CmsHomeSlide_homeId_fkey"
    FOREIGN KEY ("homeId") REFERENCES "CmsHome"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CmsPage" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "CmsPageStatus" NOT NULL DEFAULT 'DRAFT',
  "updatedByStaffUserId" UUID,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CmsHome" (
  "id",
  "heroTitle",
  "heroSubtitle",
  "featuredProductIds",
  "featuredCategorySlugs",
  "updatedAt"
) VALUES (
  'default',
  'گالری نقره',
  'زیورآلات نقره اصیل با ضمانت عیار',
  '[]'::jsonb,
  '[]'::jsonb,
  CURRENT_TIMESTAMP
);

INSERT INTO "CmsHomeSlide" (
  "id", "homeId", "title", "subtitle", "imageUrl", "linkUrl", "position", "isActive", "updatedAt"
) VALUES
  (
    'c1000000-0000-4000-8000-000000000001',
    'default',
    'نقره‌ای برای لحظه‌های ماندگار',
    'انگشتر و زیورآلات نقره عیار ۹۲۵',
    '/images/hero/hero-collection.jpg',
    '/shop',
    0,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'default',
    'ست‌های هدیه نقره',
    'هدیه‌ای اصیل با بسته‌بندی ویژه',
    '/images/hero/hero-gift.jpg',
    '/shop/c/gift-sets',
    1,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'default',
    'انگشترهای نگین‌دار',
    'فیروزه، عقیق و سنگ‌های اصیل',
    '/images/hero/hero-gemstone.jpg',
    '/shop/c/gemstone-rings',
    2,
    true,
    CURRENT_TIMESTAMP
  );

INSERT INTO "CmsPage" (
  "id", "slug", "title", "bodyMarkdown", "status", "publishedAt", "updatedAt"
) VALUES
  (
    'c2000000-0000-4000-8000-000000000001',
    'about',
    'درباره ما',
    '# درباره گالری نقره

از سال ۱۳۸۵ زیورآلات نقره دست‌ساز را با نقره اصل عیار ۹۲۵ عرضه می‌کنیم.

## ماموریت ما

ماندگار کردن لحظه‌های خاص شما با اصالت، قیمت منصفانه و ارسال به‌موقع.',
    'PUBLISHED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'contact',
    'تماس با ما',
    '# تماس با ما

برای پرسش درباره سفارش، محصول یا خدمات پس از فروش با تیم پشتیبانی تماس بگیرید.

ساعات پاسخگویی: **شنبه تا پنج‌شنبه، ۹ تا ۱۸**',
    'PUBLISHED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'c2000000-0000-4000-8000-000000000003',
    'faq',
    'سوالات متداول',
    '# سوالات متداول

## چگونه سفارش ثبت کنم؟

محصول و تنوع موردنظر را به سبد اضافه کنید و مراحل پرداخت را تکمیل کنید.

## چگونه درخواست مرجوعی بدهم؟

پس از تحویل، از جزئیات سفارش و در مهلت نمایش‌داده‌شده درخواست خود را ثبت کنید.',
    'PUBLISHED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'c2000000-0000-4000-8000-000000000004',
    'terms',
    'قوانین و مقررات',
    '# قوانین و مقررات

استفاده از فروشگاه و ثبت سفارش به معنای پذیرش شرایط جاری فروش، پرداخت، ارسال و مرجوعی است.

## بازگشت کالا

مهلت دقیق بازگشت در تنظیمات فروشگاه تعیین می‌شود و از زمان تحویل محاسبه خواهد شد.',
    'PUBLISHED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

CREATE INDEX "CmsHomeSlide_homeId_isActive_position_idx"
  ON "CmsHomeSlide"("homeId", "isActive", "position");
CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");
CREATE INDEX "CmsPage_status_updatedAt_idx" ON "CmsPage"("status", "updatedAt");
