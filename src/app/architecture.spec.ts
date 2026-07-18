import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const sourceRoot = resolve(__dirname, '..');

describe('application architecture', () => {
  const sourceFiles = listTypeScriptFiles(sourceRoot).filter(
    (file) => !file.endsWith('.spec.ts') && !file.endsWith('.d.ts'),
  );

  it('has an acyclic source dependency graph without Nest forward references', () => {
    const graph = new Map(
      sourceFiles.map((file) => [file, resolveLocalImports(file, readFileSync(file, 'utf8'))]),
    );
    const cycle = findCycle(graph);
    const forwardReferences = sourceFiles.filter((file) =>
      readFileSync(file, 'utf8').includes('forwardRef('),
    );

    expect(cycle?.map(displayPath)).toBeUndefined();
    expect(forwardReferences.map(displayPath)).toEqual([]);
  });

  it('does not import another business module repository or infrastructure implementation', () => {
    const violations: string[] = [];
    for (const source of sourceFiles) {
      const sourceModule = owningModule(source);
      if (!sourceModule) continue;
      for (const target of resolveLocalImports(source, readFileSync(source, 'utf8'))) {
        const targetModule = owningModule(target);
        if (!targetModule || targetModule === sourceModule) continue;
        const targetPath = displayPath(target);
        if (/\/(repositories|infrastructure)\//.test(targetPath)) {
          violations.push(`${displayPath(source)} -> ${targetPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps staff and customer identities in separate models and modules', () => {
    const schema = readFileSync(resolve(sourceRoot, '../prisma/schema.prisma'), 'utf8');
    const authModule = readFileSync(resolve(sourceRoot, 'modules/auth/auth.module.ts'), 'utf8');
    const customersModule = readFileSync(
      resolve(sourceRoot, 'modules/customers/customers.module.ts'),
      'utf8',
    );

    expect(schema).toMatch(/model StaffUser\s*{/);
    expect(schema).toMatch(/model StaffSession\s*{/);
    expect(schema).toMatch(/model Customer\s*{/);
    expect(schema).toMatch(/model CustomerSession\s*{/);
    expect(authModule).not.toContain('CustomersModule');
    expect(customersModule).toContain('CustomerTokenService');
    expect(customersModule).toContain('CustomerPasswordService');
  });

  it('keeps every business controller versioned and in an explicit route space', () => {
    const controllerFiles = sourceFiles.filter((file) => file.endsWith('.controller.ts'));
    const violations: string[] = [];
    for (const file of controllerFiles) {
      const source = readFileSync(file, 'utf8');
      const path = source.match(/path:\s*'([^']+)'/)?.[1];
      const versioned = /version:\s*'1'/.test(source) || source.includes('VERSION_NEUTRAL');
      const allowedPath =
        file.endsWith(`${sep}app${sep}health.controller.ts`) ||
        Boolean(path && /^(admin|store)\//.test(`${path}/`)) ||
        path === 'payments/webhooks';
      if (!versioned || !allowedPath) {
        violations.push(`${displayPath(file)} (${path ?? 'missing path'})`);
      }
    }

    expect(violations).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? listTypeScriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

function resolveLocalImports(file: string, source: string): string[] {
  const imports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
  return imports.flatMap((specifier) => {
    const base = resolve(dirname(file), specifier);
    const target = [`${base}.ts`, join(base, 'index.ts')].find(existsSync);
    return target ? [target] : [];
  });
}

function findCycle(graph: Map<string, string[]>): string[] | undefined {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): string[] | undefined => {
    if (active.has(node)) return [...stack.slice(stack.indexOf(node)), node];
    if (visited.has(node)) return undefined;
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    active.delete(node);
    return undefined;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

function owningModule(file: string): string | undefined {
  return displayPath(file).match(/^modules\/([^/]+)\//)?.[1];
}

function displayPath(file: string): string {
  return relative(sourceRoot, file).split(sep).join('/');
}
