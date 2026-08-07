const { promisify } = require('node:util');
const { randomBytes, scrypt: scryptCallback } = require('node:crypto');
const {
  PrismaClient,
  ProductStatus,
  ProductVariantStatus,
  StaffRole,
  StaffStatus,
  ShippingMethodType,
} = require('@prisma/client');

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required to seed a deployment.`);
  return value;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function seedOwner(database, environment) {
  const email = required(environment, 'SEED_OWNER_EMAIL').toLowerCase();
  const password = required(environment, 'SEED_OWNER_PASSWORD');
  if (password.length < 12) throw new Error('SEED_OWNER_PASSWORD must be at least 12 characters.');

  const existing = await database.staffUser.findUnique({ where: { email } });
  if (existing) return existing;

  return database.staffUser.create({
    data: {
      email,
      name: environment.SEED_OWNER_NAME?.trim() || 'Store Owner',
      passwordHash: await hashPassword(password),
      role: StaffRole.OWNER,
      status: StaffStatus.ACTIVE,
    },
  });
}

async function seedShipping(database, environment, currency) {
  const standard = await database.shippingMethod.upsert({
    where: { code: 'standard' },
    update: {},
    create: {
      code: 'standard',
      name: 'Standard delivery',
      provider: 'LOCAL',
      type: ShippingMethodType.STANDARD,
      currency,
      defaultPrice: environment.SEED_STANDARD_SHIPPING_PRICE || '0.00',
      estimatedMinDays: 2,
      estimatedMaxDays: 5,
    },
  });
  await database.shippingMethod.upsert({
    where: { code: 'local-pickup' },
    update: {},
    create: {
      code: 'local-pickup',
      name: 'Local pickup',
      provider: 'LOCAL',
      type: ShippingMethodType.LOCAL_PICKUP,
      currency,
      defaultPrice: '0.00',
      estimatedMinDays: 0,
      estimatedMaxDays: 1,
      pickupInstructions: 'Contact the shop to arrange pickup.',
    },
  });
  return standard;
}

async function seedE2eFixtures(database, environment, currency) {
  if (environment.E2E_SEED_FIXTURES !== 'true') return null;

  const customerPassword = environment.E2E_CUSTOMER_PASSWORD || 'customer-password';
  if (customerPassword.length < 8) {
    throw new Error('E2E_CUSTOMER_PASSWORD must be at least 8 characters.');
  }
  const customerPasswordHash = await hashPassword(customerPassword);

  const customer = await database.customer.upsert({
    where: { email: environment.E2E_CUSTOMER_EMAIL || 'customer@example.test' },
    update: {
      name: 'E2E Customer',
      passwordHash: customerPasswordHash,
      status: 'ACTIVE',
    },
    create: {
      email: environment.E2E_CUSTOMER_EMAIL || 'customer@example.test',
      phone: '+989120000001',
      name: 'E2E Customer',
      passwordHash: customerPasswordHash,
      status: 'ACTIVE',
    },
  });
  const category = await database.category.upsert({
    where: { slug: 'silver-rings' },
    update: { name: 'انگشتر نقره', isActive: true },
    create: {
      name: 'انگشتر نقره',
      slug: 'silver-rings',
      description: 'انگشترهای نقره برای آزمون یکپارچه واقعی',
      isActive: true,
    },
  });
  const brand = await database.brand.upsert({
    where: { slug: 'silver-gallery' },
    update: { name: 'گالری نقره' },
    create: { name: 'گالری نقره', slug: 'silver-gallery' },
  });
  const product = await database.product.upsert({
    where: { slug: 'e2e-silver-ring' },
    update: {
      brandId: brand.id,
      name: 'انگشتر نقره آزمون',
      status: ProductStatus.ACTIVE,
      publishedAt: new Date(),
    },
    create: {
      brandId: brand.id,
      name: 'انگشتر نقره آزمون',
      slug: 'e2e-silver-ring',
      description: 'محصول واقعی و تکرارپذیر برای آزمون مرورگر سرتاسری.',
      status: ProductStatus.ACTIVE,
      publishedAt: new Date(),
    },
  });
  const variant = await database.productVariant.upsert({
    where: { sku: 'E2E-SILVER-RING' },
    update: {
      productId: product.id,
      name: 'سایز استاندارد',
      status: ProductVariantStatus.ACTIVE,
      isDefault: true,
    },
    create: {
      productId: product.id,
      name: 'سایز استاندارد',
      sku: 'E2E-SILVER-RING',
      status: ProductVariantStatus.ACTIVE,
      isDefault: true,
    },
  });
  await database.productPrice.upsert({
    where: { variantId_currency: { variantId: variant.id, currency } },
    update: { amount: '25000000.00', compareAtAmount: '27500000.00' },
    create: {
      variantId: variant.id,
      currency,
      amount: '25000000.00',
      compareAtAmount: '27500000.00',
    },
  });
  await database.inventoryItem.upsert({
    where: { variantId: variant.id },
    update: { currentStock: 25, reservedStock: 0, lowStockThreshold: 5 },
    create: {
      variantId: variant.id,
      currentStock: 25,
      reservedStock: 0,
      lowStockThreshold: 5,
    },
  });
  await database.productCategory.upsert({
    where: {
      productId_categoryId: {
        productId: product.id,
        categoryId: category.id,
      },
    },
    update: {},
    create: { productId: product.id, categoryId: category.id },
  });
  const defaultPromoTiles = [
    {
      title: 'ارسال رایگان',
      body: 'برای سفارش‌های بالای ۸۰۰ هزار تومان',
      cta: 'شروع خرید',
      linkUrl: '/shop',
      imageUrl: '/images/categories/gift-sets.jpg',
    },
    {
      title: 'کالکشن جدید',
      body: 'جدیدترین انگشترهای نگین‌دار',
      cta: 'مشاهده کالکشن',
      linkUrl: '/shop/c/gemstone-rings',
      imageUrl: '/images/categories/gemstone-rings.jpg',
    },
  ];
  const defaultTestimonials = [
    {
      name: 'مریم احمدی',
      city: 'تهران',
      quote:
        'انگشتر نقره‌ام فوق‌العاده بود. کیفیت ساخت و بسته‌بندی خیلی شیک بود.',
    },
    {
      name: 'علی رضایی',
      city: 'اصفهان',
      quote: 'برای هدیه سالگرد سفارش دادم؛ به‌موقع رسید و بسیار زیبا بود.',
    },
    {
      name: 'زهرا کریمی',
      city: 'شیراز',
      quote: 'طراحی حلقه‌هایشان بی‌نظیر است. حتماً دوباره خرید می‌کنم.',
    },
    {
      name: 'حسین محمدی',
      city: 'مشهد',
      quote: 'اصالت نقره و عیار کاملاً مشخص بود. کیفیت عالی.',
    },
  ];
  await database.cmsHome.upsert({
    where: { id: 'default' },
    update: {
      featuredProductIds: [product.id],
      featuredCategorySlugs: [category.slug],
      promoTiles: defaultPromoTiles,
      testimonials: defaultTestimonials,
    },
    create: {
      id: 'default',
      heroTitle: 'گالری نقره',
      heroSubtitle: 'زیبایی ماندگار با نقره اصل',
      featuredProductIds: [product.id],
      featuredCategorySlugs: [category.slug],
      promoTiles: defaultPromoTiles,
      testimonials: defaultTestimonials,
    },
  });

  return { customer, category, product, variant };
}

// Curated from 20 product posts in the Bale channel «گالری انگشتر ثارالله».
// The catalog keeps the source facts in Product.details so admins can edit the
// fields customers actually use without creating a large attribute matrix.
async function seedBaleCatalog(database, currency) {
  const category = await database.category.upsert({
    where: { slug: 'stone-jewelry' },
    update: { name: 'زیورآلات سنگی', isActive: true },
    create: { name: 'زیورآلات سنگی', slug: 'stone-jewelry', isActive: true },
  });
  const products = [
    ['3416', 'انگشتر تمام نقره یا حسین مظلوم', 'ring', 'سنگ ذکر شده در متن کانال', 'سفید', undefined, 'یا حسین مظلوم', 'سایز و ارسال رایگان', 5300000, 3],
    ['3417', 'دستبند خطی عقیق سرخ یا مهدی', 'bracelet', 'عقیق', 'سرخ', '28×25 میلیمتر', 'یا مهدی', 'قاب نقره دست‌ساز؛ بند چرم طبیعی، سایز قابل تنظیم', 2750000, 5],
    ['3178', 'انگشتر عقیق آبی حرز کبیر امام جواد', 'ring', 'عقیق', 'آبی', '25×18 میلیمتر', 'حرز کبیر امام جواد علیه السلام', 'سنگ پاک و شفاف', 5300000, 5],
    ['3418', 'دستبند خطی عقیق سرخ یا علی', 'bracelet', 'عقیق', 'سرخ', '28×25 میلیمتر', 'علی علیه السلام', 'قاب نقره دست‌ساز؛ بند چرم طبیعی، سایز قابل تنظیم', 2850000, 5],
    ['3419', 'انگشتر خطی عقیق سبز یا علی', 'ring', 'عقیق', 'سبز', '20×15 میلیمتر', 'علی', 'حکاکی و تذهیب دستی', 3700000, 5],
    ['unlisted-1', 'انگشتر خطی عقیق سرخ یا حسین با چهار سلام', 'ring', 'عقیق', 'سرخ', '25×18 میلیمتر', 'یا فاطمه الزهرا', 'دور رکاب چهار سلام زیارت عاشورا؛ روی رکاب یا حسین', 6300000, 2],
    ['3421', 'انگشتر خطی عقیق سرخ یا حسین', 'ring', 'عقیق', 'سرخ', '25×18 میلیمتر', 'یا حسین', undefined, 4700000, 5],
    ['3422', 'انگشتر خطی عقیق سبز امن المتوکلون', 'ring', 'عقیق', 'سبز', '20×15 میلیمتر', 'امن المتوکلون', undefined, 5500000, 5],
    ['3423', 'انگشتر خطی عقیق سرخ ان معی ربی', 'ring', 'عقیق', 'سرخ', '20×15 میلیمتر', 'ان معی ربی', undefined, 5700000, 5],
    ['3424', 'انگشتر شجر قائن اصلی نقش بزرگ', 'ring', 'شجر قائن', 'طبیعی', '22×17 میلیمتر', undefined, 'فاخر و دست‌ساز؛ پشت بسته با حرز و تربت؛ نگین شفاف با منظره خاص بی‌نظیر', 7500000, 1],
    ['3425', 'انگشتر خطی عقیق مشکی با ذکر حسین', 'ring', 'عقیق', 'مشکی', '20×15 میلیمتر', 'حسین', 'دور رکاب چهار سلام زیارت عاشورا؛ روی رکاب یا رقیه و یا زینب', 5300000, 5],
    ['3426', 'انگشتر عقیق کبود یمنی', 'ring', 'عقیق کبود یمنی', 'کبود', '20×15 میلیمتر', undefined, 'سنگ مرغوب و خوشرنگ', 5700000, 5],
    ['3427', 'انگشتر خطی عقیق مشکی امیری حسین', 'ring', 'عقیق', 'مشکی', '25×18 میلیمتر', 'امیری حسین و نعم الامیر', undefined, 5700000, 5],
    ['3431', 'انگشتر خطی زنانه عقیق سرخ', 'ring', 'عقیق', 'سرخ', '16×12 میلیمتر', 'حسین علیه السلام', undefined, 3450000, 5],
    ['3429', 'انگشتر خطی عقیق سرخ علی ولی الله', 'ring', 'عقیق', 'سرخ', '25×18 میلیمتر', 'علی ولی الله', undefined, 4700000, 5],
    ['3428', 'انگشتر خطی عقیق سبز ذوالفقار', 'ring', 'عقیق', 'سبز', '25×18 میلیمتر', 'ان معی ربی', 'دور رکاب ناد علیاً؛ روی رکاب یا حیدر کرار و نقش شمشیر ذوالفقار؛ چنگ طلایی رنگ ثابت', 7500000, 5],
    ['3432', 'انگشتر خطی عقیق زرد طرح ذوالفقار', 'ring', 'عقیق', 'زرد', '20×15 میلیمتر', 'طرح حرم و ضربان', 'روی رکاب طرح شمشیر ذوالفقار و ذکر لافتی الا علی لا سیف الا ذوالفقار؛ چنگ طلایی رنگ ثابت', 6300000, 5],
    ['3433', 'انگشتر خطی عقیق زرد شرف الشمس', 'ring', 'عقیق شرف الشمس', 'زرد', '20×15 میلیمتر', 'یا حسین علیه السلام', undefined, 5500000, 5],
    ['3434', 'انگشتر شجر قائن اصلی', 'ring', 'شجر قائن', 'طبیعی', '20×15 میلیمتر', undefined, 'دست‌ساز؛ پشت بسته با حرز و تربت؛ نگین شفاف با منظره خاص', 5700000, 1],
    ['3437', 'دستبند خطی عقیق سبز یا سیدالشهدا', 'bracelet', 'عقیق', 'سبز', '28×22 میلیمتر', 'یا سیدالشهدا', 'قاب نقره دست‌ساز؛ بند چرم طبیعی، سایز قابل تنظیم', 2850000, 5],
  ];

  for (const [sourceCode, name, itemType, stone, stoneColor, stoneSize, engraving, bandDetails, priceToman, stock] of products) {
    const slug = `bale-${sourceCode.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase();
    const details = {
      item_type: itemType,
      stone,
      stone_color: stoneColor,
      stone_size: stoneSize,
      engraving,
      band_details: bandDetails,
      material: 'نقره',
      purity: '925',
      fit: itemType === 'bracelet' ? 'سایز قابل تنظیم' : sourceCode === '3416' ? 'سایز و ارسال رایگان' : 'سایز انگشتر هنگام سفارش',
      stock_note: stock === 1 ? 'موجودی یک عدد' : sourceCode === '3416' ? 'موجودی سه عدد' : undefined,
      source_code: sourceCode,
      customizable: true,
      source_channel: 'https://web.bale.ai/chat?uid=4524921184',
    };
    const product = await database.product.upsert({
      where: { slug },
      update: { name, details, status: ProductStatus.ACTIVE, publishedAt: new Date() },
      create: { name, slug, description: `${name}؛ نقره عیار 925 با سنگ طبیعی و حکاکی دست‌ساز.`, details, status: ProductStatus.ACTIVE, publishedAt: new Date() },
    });
    const variant = await database.productVariant.upsert({
      where: { sku: `BALE-${sourceCode.toUpperCase()}` },
      update: { productId: product.id, name, status: ProductVariantStatus.ACTIVE, isDefault: true },
      create: { productId: product.id, name, sku: `BALE-${sourceCode.toUpperCase()}`, status: ProductVariantStatus.ACTIVE, isDefault: true },
    });
    await database.productPrice.upsert({
      where: { variantId_currency: { variantId: variant.id, currency } },
      update: { amount: String(priceToman * 10) },
      create: { variantId: variant.id, currency, amount: String(priceToman * 10) },
    });
    await database.inventoryItem.upsert({
      where: { variantId: variant.id },
      update: { currentStock: stock, reservedStock: 0 },
      create: { variantId: variant.id, currentStock: stock, reservedStock: 0 },
    });
    await database.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: category.id } },
      update: {},
      create: { productId: product.id, categoryId: category.id },
    });
  }
  return { category, count: products.length };
}

async function seedDeployment(database = prisma, environment = process.env) {
  const currency = (environment.SEED_SHOP_CURRENCY || 'IRR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('SEED_SHOP_CURRENCY must be a 3-letter code.');

  const owner = await seedOwner(database, environment);
  const standardShipping = await seedShipping(database, environment, currency);
  await database.shopSettings.upsert({
    where: { id: 'default' },
    update: {
      shopName: environment.SEED_SHOP_NAME?.trim() || 'Example Store',
      currency,
      defaultShippingMethodId: standardShipping.id,
      orderPrefix: environment.SEED_ORDER_PREFIX?.trim() || 'ORD',
      updatedByStaffUserId: owner.id,
    },
    create: {
      id: 'default',
      shopName: environment.SEED_SHOP_NAME?.trim() || 'Example Store',
      currency,
      taxEnabled: false,
      taxRate: '0',
      defaultShippingMethodId: standardShipping.id,
      orderPrefix: environment.SEED_ORDER_PREFIX?.trim() || 'ORD',
      lowStockThreshold: 5,
      guestCheckoutEnabled: true,
      updatedByStaffUserId: owner.id,
    },
  });
  const fixtures = await seedE2eFixtures(database, environment, currency);
  const baleCatalog = await seedBaleCatalog(database, currency);

  return fixtures ? { owner, standardShipping, fixtures, baleCatalog } : { owner, standardShipping, baleCatalog };
}

if (require.main === module) {
  seedDeployment()
    .then(({ owner }) => console.log(`Seeded reusable shop defaults and owner ${owner.email}.`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

module.exports = { seedDeployment };
