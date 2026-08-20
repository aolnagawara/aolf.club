import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_ROOT = fileURLToPath(new URL('../../api', import.meta.url));
const HOBBY_FUNCTION_LIMIT = 12;

function listServerlessEntryFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === '_lib') {
      continue;
    }
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listServerlessEntryFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Vercel Hobby serverless budget', () => {
  it('keeps API entry files at or below 12 functions', () => {
    const files = listServerlessEntryFiles(API_ROOT).sort();
    expect(
      files.length,
      'Hobby allows 12 serverless entry files under api/ excluding _lib. Found:\n' +
        files.join('\n')
    ).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});
