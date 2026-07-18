const { promisify } = require('node:util');
const { randomBytes, scrypt: scryptCallback } = require('node:crypto');
const { PrismaClient, StaffRole, StaffStatus, ShippingMethodType } = require('@prisma/client');

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

async function seedDeployment(database = prisma, environment = process.env) {
  const currency = (environment.SEED_SHOP_CURRENCY || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('SEED_SHOP_CURRENCY must be a 3-letter code.');

  const owner = await seedOwner(database, environment);
  const standardShipping = await seedShipping(database, environment, currency);
  await database.shopSettings.upsert({
    where: { id: 'default' },
    update: {},
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

  return { owner, standardShipping };
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
