-- AlterTable
ALTER TABLE "CmsHome" ADD COLUMN IF NOT EXISTS "promoImageUrl" TEXT;
ALTER TABLE "CmsHome" ADD COLUMN IF NOT EXISTS "promoTiles" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "CmsHome" ADD COLUMN IF NOT EXISTS "testimonials" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "CmsHome"
SET
  "promoTiles" = '[
    {
      "title": "ارسال رایگان",
      "body": "برای سفارش‌های بالای ۸۰۰ هزار تومان",
      "cta": "شروع خرید",
      "linkUrl": "/shop",
      "imageUrl": "/images/categories/gift-sets.jpg"
    },
    {
      "title": "کالکشن جدید",
      "body": "جدیدترین انگشترهای نگین‌دار",
      "cta": "مشاهده کالکشن",
      "linkUrl": "/shop/c/gemstone-rings",
      "imageUrl": "/images/categories/gemstone-rings.jpg"
    }
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default' AND "promoTiles" = '[]'::jsonb;

UPDATE "CmsHome"
SET
  "testimonials" = '[
    {
      "name": "مریم احمدی",
      "city": "تهران",
      "quote": "انگشتر نقره‌ام فوق‌العاده بود. کیفیت ساخت و بسته‌بندی خیلی شیک بود."
    },
    {
      "name": "علی رضایی",
      "city": "اصفهان",
      "quote": "برای هدیه سالگرد سفارش دادم؛ به‌موقع رسید و بسیار زیبا بود."
    },
    {
      "name": "زهرا کریمی",
      "city": "شیراز",
      "quote": "طراحی حلقه‌هایشان بی‌نظیر است. حتماً دوباره خرید می‌کنم."
    },
    {
      "name": "حسین محمدی",
      "city": "مشهد",
      "quote": "اصالت نقره و عیار کاملاً مشخص بود. کیفیت عالی."
    }
  ]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default' AND "testimonials" = '[]'::jsonb;
