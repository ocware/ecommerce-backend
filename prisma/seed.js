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
  await database.cmsHome.upsert({
    where: { id: 'default' },
    update: {
      featuredProductIds: [product.id],
      featuredCategorySlugs: [category.slug],
    },
    create: {
      id: 'default',
      heroTitle: 'گالری نقره',
      heroSubtitle: 'زیبایی ماندگار با نقره اصل',
      featuredProductIds: [product.id],
      featuredCategorySlugs: [category.slug],
    },
  });

  return { customer, category, product, variant };
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

  return fixtures ? { owner, standardShipping, fixtures } : { owner, standardShipping };
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
