import {
  buildStoreCategoryTree,
  buildSubtreeProductCounts,
  getAncestorIds,
  getDescendantIds,
  getPublicCategoryIds,
  type FlatCategoryNode,
} from './category-hierarchy.util';

describe('category-hierarchy.util', () => {
  const categories: FlatCategoryNode[] = [
    {
      id: 'a',
      parentId: null,
      name: 'A',
      slug: 'a',
      description: null,
      imageUrl: null,
      position: 0,
      isActive: true,
    },
    {
      id: 'b',
      parentId: 'a',
      name: 'B',
      slug: 'b',
      description: null,
      imageUrl: null,
      position: 0,
      isActive: true,
    },
    {
      id: 'c',
      parentId: 'b',
      name: 'C',
      slug: 'c',
      description: null,
      imageUrl: null,
      position: 0,
      isActive: true,
    },
    {
      id: 'hidden',
      parentId: 'a',
      name: 'Hidden',
      slug: 'hidden',
      description: null,
      imageUrl: null,
      position: 1,
      isActive: false,
    },
  ];

  it('collects descendants and ancestors', () => {
    const childrenMap = new Map([
      ['a', ['b', 'hidden']],
      ['b', ['c']],
    ]);
    const parentMap = new Map([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
      ['hidden', 'a'],
    ]);

    expect(getDescendantIds('a', childrenMap)).toEqual(
      expect.arrayContaining(['b', 'c', 'hidden']),
    );
    expect(getDescendantIds('a', childrenMap).length).toBe(3);
    expect(getAncestorIds('c', parentMap)).toEqual(['b', 'a']);
  });

  it('excludes categories under inactive ancestors from public visibility', () => {
    const inactiveRoot: FlatCategoryNode[] = [
      {
        id: 'root',
        parentId: null,
        name: 'Root',
        slug: 'root',
        description: null,
        imageUrl: null,
        position: 0,
        isActive: false,
      },
      {
        id: 'child',
        parentId: 'root',
        name: 'Child',
        slug: 'child',
        description: null,
        imageUrl: null,
        position: 0,
        isActive: true,
      },
    ];
    const publicIds = getPublicCategoryIds(inactiveRoot);
    expect(publicIds.has('child')).toBe(false);
  });

  it('aggregates subtree product counts with deduplication', () => {
    const childrenMap = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    const productsByCategory = new Map([
      ['a', new Set(['p1', 'p2'])],
      ['b', new Set(['p2', 'p3'])],
      ['c', new Set(['p3', 'p4'])],
    ]);
    const counts = buildSubtreeProductCounts(
      ['a', 'b', 'c'],
      childrenMap,
      productsByCategory,
    );
    expect(counts.get('c')).toBe(2);
    expect(counts.get('b')).toBe(3);
    expect(counts.get('a')).toBe(4);
  });

  it('builds a root-only nested tree with subtree counts', () => {
    const publicIds = getPublicCategoryIds(categories);
    const directCounts = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ]);
    const subtreeCounts = new Map([
      ['a', 4],
      ['b', 3],
      ['c', 1],
    ]);
    const tree = buildStoreCategoryTree(
      categories,
      publicIds,
      directCounts,
      subtreeCounts,
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].slug).toBe('a');
    expect(tree[0].productCount).toBe(4);
    expect(tree[0].children[0].slug).toBe('b');
    expect(tree[0].children[0].children[0].slug).toBe('c');
    expect(tree[0].children.some((child) => child.slug === 'hidden')).toBe(
      false,
    );
  });
});
