import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const volunteerPageUrl = new URL('../../src/volunteer.html', import.meta.url);

describe('course editor presentation', () => {
  it('renders upload errors and the file-size limit inside the dialog', () => {
    const page = readFileSync(volunteerPageUrl, 'utf8');
    const editorStart = page.indexOf('<!-- Course editor -->');
    const pickerStart = page.indexOf('<!-- WhatsApp course picker -->');
    const editor = page.slice(editorStart, pickerStart);

    expect(editor).toContain('x-show="courseEditorError"');
    expect(editor).toContain('x-text="courseEditorError"');
    expect(editor).toContain('role="alert"');
    expect(editor).toContain('(max 600 KB)');
  });
});
