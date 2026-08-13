type SeedResult = {
  owner: { id: string; email: string };
  standardShipping: { id: string; code: string };
};

const { seedDeployment } = jest.requireActual<{
  seedDeployment: (
    database: Record<string, unknown>,
    environment: Record<string, string>,
  ) => Promise<SeedResult>;
}>('../../prisma/seed.js');

describe('reusable deployment seed', () => {
  it('creates an owner, generic shipping methods, and initial settings idempotently', async () => {
    const owner = { id: 'owner-id', email: 'owner@example.com' };
    const standard = { id: 'standard-id', code: 'standard' };
    const category = { id: 'cat-id', slug: 'stone-jewelry' };
    const database = {
      staffUser: {
        findUnique: jest.fn(() => null),
        create: jest.fn(() => owner),
      },
      shippingMethod: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce(standard)
          .mockResolvedValueOnce({ id: 'pickup-id', code: 'local-pickup' }),
      },
      shopSettings: { upsert: jest.fn(() => ({ id: 'default' })) },
      category: { upsert: jest.fn(() => category) },
      product: {
        upsert: jest.fn(({ create }: { create: { slug: string } }) => ({
          id: 'product-id',
          slug: create.slug,
        })),
      },
      productVariant: {
        upsert: jest.fn(() => ({ id: 'variant-id' })),
      },
      productPrice: { upsert: jest.fn(() => ({})) },
      inventoryItem: { upsert: jest.fn(() => ({})) },
      productCategory: { upsert: jest.fn(() => ({})) },
    };

    const result = await seedDeployment(database, {
      SEED_OWNER_EMAIL: 'OWNER@example.com',
      SEED_OWNER_PASSWORD: 'long-bootstrap-password',
      SEED_SHOP_NAME: 'Reusable Store',
      SEED_SHOP_CURRENCY: 'usd',
      SEED_ORDER_PREFIX: 'WEB',
      SEED_STANDARD_SHIPPING_PRICE: '5.00',
    });

    expect(result).toEqual({
      owner,
      standardShipping: standard,
      baleCatalog: { category, count: 20 },
    });
    expect(database.staffUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'owner@example.com',
        role: 'OWNER',
        passwordHash: expect.stringMatching(/^scrypt:/) as string,
      }) as Record<string, unknown>,
    });
    expect(database.shopSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          shopName: 'Reusable Store',
          currency: 'USD',
        }) as Record<string, unknown>,
        create: expect.objectContaining({
          currency: 'USD',
          defaultShippingMethodId: standard.id,
        }) as Record<string, unknown>,
      }),
    );
  });
});
