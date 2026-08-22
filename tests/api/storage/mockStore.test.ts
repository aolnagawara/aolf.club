import { describe, expect, it } from 'vitest';
import {
  createCourseForUser,
  deleteCourseForUser,
  getBootstrapForUser,
  getPublicCourses
} from '../../../api/_lib/storage/mockStore.js';

describe('mock store campaign selection', () => {
  it('rejects an unknown requested campaign like the Sheets store', async () => {
    await expect(
      getBootstrapForUser(
        { id: 'user-1', email: 'volunteer@example.com' },
        'missingCampaign00000x'
      )
    ).rejects.toThrow('CAMPAIGN_NOT_FOUND');
  });
});

describe('mock store courses', () => {
  it('creates and deletes a course used by the public reader', async () => {
    const created = await createCourseForUser(
      { id: 'user-1', email: 'volunteer@example.com' },
      { courseType: 'Sahaj', isActive: true }
    );
    expect(created.course.title).toBe('Sahaj');
    await expect(getPublicCourses('sahaj')).resolves.toMatchObject({
      selected: { title: 'Sahaj' },
      selectionMatched: true
    });
    await deleteCourseForUser({ id: created.course.id });
    await expect(getPublicCourses('sahaj')).resolves.toMatchObject({
      selectionMatched: false
    });
  });
});
