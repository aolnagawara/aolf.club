import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const volunteerPageUrl = new URL('../../src/volunteer.html', import.meta.url);

describe('course editor presentation', () => {
  it('renders the image status beside a custom file chooser', () => {
    const page = readFileSync(volunteerPageUrl, 'utf8');
    const editorStart = page.indexOf('<!-- Course editor -->');
    const pickerStart = page.indexOf('<!-- WhatsApp course picker -->');
    const editor = page.slice(editorStart, pickerStart);

    expect(editor).toContain('x-show="courseEditorError"');
    expect(editor).toContain('x-text="courseEditorError"');
    expect(editor).toContain('class="sr-only"');
    expect(editor).toContain('Choose image');
    expect(editor).toContain('x-show="coursePamphletError"');
    expect(editor).toContain('x-text="coursePamphletError"');
    expect(editor).toContain('No image selected');
    expect(editor).toContain('role="alert"');
    expect(editor).toContain('(&lt; 600 KB)');
  });
});
