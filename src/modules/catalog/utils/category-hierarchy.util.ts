export interface FlatCategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
}

export interface StoreCategoryTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  depth: number;
  directProductCount: number;
  productCount: number;
  children: StoreCategoryTreeNode[];
}

export function buildChildrenMap(categories: FlatCategoryNode[]): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = childrenMap.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenMap.set(category.parentId, siblings);
  }
  return childrenMap;
}

export function getDescendantIds(
  categoryId: string,
  childrenMap: Map<string, string[]>,
): string[] {
  const descendants: string[] = [];
  const queue = [...(childrenMap.get(categoryId) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    descendants.push(current);
    const children = childrenMap.get(current) ?? [];
    for (const childId of children) {
      if (!seen.has(childId)) queue.push(childId);
    }
  }
  return descendants;
}

export function getAncestorIds(
  categoryId: string,
  parentMap: Map<string, string | null>,
): string[] {
  const ancestors: string[] = [];
  let current = parentMap.get(categoryId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    ancestors.push(current);
    current = parentMap.get(current) ?? null;
  }
  return ancestors;
}

export function isPubliclyVisibleCategory(
  categoryId: string,
  nodesById: Map<string, FlatCategoryNode>,
  parentMap: Map<string, string | null>,
): boolean {
  const category = nodesById.get(categoryId);
  if (!category?.isActive) return false;
  const ancestors = getAncestorIds(categoryId, parentMap);
  return ancestors.every((ancestorId) => nodesById.get(ancestorId)?.isActive);
}

export function getPublicCategoryIds(
  categories: FlatCategoryNode[],
): Set<string> {
  const nodesById = new Map(categories.map((category) => [category.id, category]));
  const parentMap = new Map(
    categories.map((category) => [category.id, category.parentId]),
  );
  const publicIds = new Set<string>();
  for (const category of categories) {
    if (isPubliclyVisibleCategory(category.id, nodesById, parentMap)) {
      publicIds.add(category.id);
    }
  }
  return publicIds;
}

export function buildSubtreeProductCounts(
  categoryIds: string[],
  childrenMap: Map<string, string[]>,
  productsByCategory: Map<string, Set<string>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const categoryId of categoryIds) {
    const scope = new Set<string>([categoryId, ...getDescendantIds(categoryId, childrenMap)]);
    const productIds = new Set<string>();
    for (const scopedId of scope) {
      const assigned = productsByCategory.get(scopedId);
      if (!assigned) continue;
      for (const productId of assigned) productIds.add(productId);
    }
    counts.set(categoryId, productIds.size);
  }
  return counts;
}

export function buildStoreCategoryTree(
  categories: FlatCategoryNode[],
  publicIds: Set<string>,
  directCounts: Map<string, number>,
  subtreeCounts: Map<string, number>,
): StoreCategoryTreeNode[] {
  const nodesById = new Map(categories.map((category) => [category.id, category]));
  const childrenMap = buildChildrenMap(categories);

  const buildNode = (categoryId: string, depth: number): StoreCategoryTreeNode | null => {
    const category = nodesById.get(categoryId);
    if (!category || !publicIds.has(categoryId)) return null;
    const childIds = (childrenMap.get(categoryId) ?? []).filter((id) => publicIds.has(id));
    childIds.sort((left, right) => {
      const leftNode = nodesById.get(left)!;
      const rightNode = nodesById.get(right)!;
      if (leftNode.position !== rightNode.position) {
        return leftNode.position - rightNode.position;
      }
      return leftNode.name.localeCompare(rightNode.name, 'fa');
    });
    const children = childIds
      .map((childId) => buildNode(childId, depth + 1))
      .filter((node): node is StoreCategoryTreeNode => Boolean(node));
    return {
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      position: category.position,
      depth,
      directProductCount: directCounts.get(category.id) ?? 0,
      productCount: subtreeCounts.get(category.id) ?? 0,
      children,
    };
  };

  const roots = categories
    .filter((category) => !category.parentId && publicIds.has(category.id))
    .sort((left, right) => {
      if (left.position !== right.position) return left.position - right.position;
      return left.name.localeCompare(right.name, 'fa');
    });

  return roots
    .map((category) => buildNode(category.id, 0))
    .filter((node): node is StoreCategoryTreeNode => Boolean(node));
}

export function sortCategoriesForAdminTree(
  categories: FlatCategoryNode[],
): FlatCategoryNode[] {
  const nodesById = new Map(categories.map((category) => [category.id, category]));
  const childrenMap = buildChildrenMap(categories);
  const sorted: FlatCategoryNode[] = [];
  const visited = new Set<string>();

  const visit = (categoryId: string) => {
    if (visited.has(categoryId)) return;
    visited.add(categoryId);
    const category = nodesById.get(categoryId);
    if (!category) return;
    sorted.push(category);
    const childIds = (childrenMap.get(categoryId) ?? []).sort((left, right) => {
      const leftNode = nodesById.get(left)!;
      const rightNode = nodesById.get(right)!;
      if (leftNode.position !== rightNode.position) {
        return leftNode.position - rightNode.position;
      }
      return leftNode.name.localeCompare(rightNode.name, 'fa');
    });
    for (const childId of childIds) visit(childId);
  };

  const roots = categories
    .filter((category) => !category.parentId)
    .sort((left, right) => {
      if (left.position !== right.position) return left.position - right.position;
      return left.name.localeCompare(right.name, 'fa');
    });
  for (const root of roots) visit(root.id);
  for (const category of categories) {
    if (!visited.has(category.id)) visit(category.id);
  }
  return sorted;
}

export function buildCategoryPathLabel(
  categoryId: string,
  nodesById: Map<string, FlatCategoryNode>,
  parentMap: Map<string, string | null>,
): string {
  const names: string[] = [];
  let current: string | null = categoryId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    const node = nodesById.get(current);
    if (!node) break;
    names.unshift(node.name);
    current = parentMap.get(current) ?? null;
  }
  return names.join(' / ');
}
