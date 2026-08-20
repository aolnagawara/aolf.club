import { describe, expect, it } from 'vitest';
import {
  createCourseForUser,
  deleteCourseForUser,
  getBootstrapForUser,
  getPublicCourseById
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
      { courseType: 'HP', month: '2026-08', isActive: true }
    );
    expect(created.course.title).toBe('HP · August 2026');
    await expect(getPublicCourseById(created.course.id)).resolves.toMatchObject({
      title: 'HP · August 2026'
    });
    await deleteCourseForUser({ id: created.course.id });
    await expect(getPublicCourseById(created.course.id)).resolves.toBeNull();
  });
});
