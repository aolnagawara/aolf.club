import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sevaPageUrl = new URL('../../src/seva.html', import.meta.url);

describe('course editor presentation', () => {
  it('renders the image status beside a custom file chooser', () => {
    const page = readFileSync(sevaPageUrl, 'utf8');
    const editorStart = page.indexOf('<!-- Activity editor -->');
    const pickerStart = page.indexOf('<!-- WhatsApp activity picker -->');
    const editor = page.slice(editorStart, pickerStart);

    expect(editor).toContain('x-show="courseEditorError"');
    expect(editor).toContain('x-text="courseEditorError"');
    expect(editor).toContain('class="sr-only"');
    expect(editor).toContain('Choose image');
    expect(editor).toContain('x-show="courseImageError"');
    expect(editor).toContain('x-text="courseImageError"');
    expect(editor).toContain('No image selected');
    expect(editor).toContain('role="alert"');
    expect(editor).toContain('(&lt; 3 MB)');
    expect(editor).toContain('max-h-96 max-w-full');
    expect(editor).toContain('object-contain');
    expect(editor).not.toContain('h-32 w-full rounded-lg object-cover');
  });
});
