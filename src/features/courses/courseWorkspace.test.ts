import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PAMPHLET_BYTES } from '../../../shared/contracts/pamphlet';
import { ApiClientError } from '../../services/apiClient';
import { sevaWorkspace } from '../seva/sevaWorkspace';

describe('course editor validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an oversized pamphlet error inside the course editor', () => {
    const app = sevaWorkspace();
    app.openCourseEditor();
    const input = {
      files: [{ size: MAX_PAMPHLET_BYTES, type: 'image/png' }],
      value: 'pamphlet.png'
    };

    app.onPamphletSelected({ target: input } as unknown as Event);

    expect(app.coursePamphletError).toBe('Image must be < 600 kb');
    expect(app.coursePamphletFileName).toBe('');
    expect(app.courseEditorError).toBe('');
    expect(app.authError).toBe('');
    expect(app.isCourseEditorOpen).toBe(true);
    expect(input.value).toBe('');
  });

  it('keeps a server save error visible in the open course editor', async () => {
    const createCourse = vi.fn(async () => {
      throw new ApiClientError(
        'Invalid course details.',
        400,
        'VALIDATION_ERROR'
      );
    });
    vi.stubGlobal('window', { appRuntime: { createCourse } });
    const app = sevaWorkspace();
    app.openCourseEditor();

    await app.saveCourse();

    expect(app.courseEditorError).toBe('Invalid course details.');
    expect(app.authError).toBe('');
    expect(app.isCourseEditorOpen).toBe(true);
    expect(app.isCourseSaving).toBe(false);
  });
});
