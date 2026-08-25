import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNTIME_ROOTS = ['api', 'src', 'shared'];
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);

function fileExtension(filePath: string): string {
  const index = filePath.lastIndexOf('.');
  return index >= 0 ? filePath.slice(index) : '';
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(fileExtension(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('runtime imports', () => {
  it('keeps xlsx in build scripts only', () => {
    const offenders = RUNTIME_ROOTS.flatMap((root) =>
      listSourceFiles(join(REPO_ROOT, root))
    )
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        return /(?:from\s+['"]xlsx['"]|import\(\s*['"]xlsx['"]\s*\)|require\(\s*['"]xlsx['"]\s*\))/.test(
          source
        );
      })
      .map((filePath) => relative(REPO_ROOT, filePath));

    expect(offenders).toEqual([]);
  });
});
