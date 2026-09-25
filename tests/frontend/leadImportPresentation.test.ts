import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sevaPageUrl = new URL('../../src/seva.html', import.meta.url);
const mainModuleUrl = new URL('../../src/main.ts', import.meta.url);

describe('import leads presentation', () => {
  it('keeps the import screen to a link, a button, and a result', () => {
    const page = readFileSync(sevaPageUrl, 'utf8');
    const mainModule = readFileSync(mainModuleUrl, 'utf8');

    expect(page).toContain('aria-label="Import leads"');
    expect(page).toContain('x-model="importSheetUrl"');
    expect(page).toContain('@submit.prevent="submitLeadImport()"');
    expect(page).toContain('Try Again');
    expect(page).toContain('Choose a month before importing leads.');
    expect(page).toContain('data-lucide="folder-input"');
    expect(mainModule).toContain('FolderInput');
    expect(page).not.toContain('Map columns');
    expect(page).not.toContain('column mapping');
  });
});
