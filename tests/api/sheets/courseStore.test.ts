import { describe, expect, it, vi } from 'vitest';
import { createSheetsStore } from '../../../api/_lib/sheets/store.js';
import {
  createMemoryImageStore,
  type ImageStore
} from '../../../api/_lib/courses/imageStore.js';
import { SHEET_HEADERS } from '../../../shared/contracts/sheetContract.mjs';
import type {
  SheetsOperation,
  SpreadsheetTarget
} from '../../../api/_lib/sheets/client.js';

const USER = {
  id: 'user-1',
  email: 'volunteer@example.com',
  name: 'Volunteer'
};
const COURSE_ID = 'crsHpNcr01AbcDefGhiJK';
const LAYOUT = {
  campaignsRange: 'Campaigns!A:F',
  leadsRange: 'Leads!A:Z',
  membersRange: 'Members!A:Z',
  coursesRange: 'Activities!A:Z',
  courseTemplatesRange: 'CourseTemplates!A:B',
  shortUrlsRange: 'ShortUrls!A:C',
  configRange: 'Config!A:B',
  allowedUsersRange: 'AllowedUsers!A:Z'
};

function courseRow(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    id: COURSE_ID,
    activityType: 'Course',
    courseType: 'HP',
    programCode: '',
    title: 'HP',
    whatsappTemplate: 'Hi {name}',
    imageFileId: '',
    imageMimeType: '',
    isActive: 'true',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: USER.email,
    updatedBy: USER.email,
    ...overrides
  };
  return SHEET_HEADERS.courses.map((header) => values[header] || '');
}

function createFixture(
  courseRows: string[][],
  imageStore: ImageStore = createMemoryImageStore(),
  shortUrlRows: string[][] = [
    [...SHEET_HEADERS.shortUrls],
    ['tu/rp', 'https://example.com/full-registration-link?utm=short', 'true'],
    ['inactive', 'https://example.com/inactive', 'false'],
    ['unsafe', 'javascript:alert(1)', 'true']
  ]
) {
  let rows = [[...SHEET_HEADERS.courses], ...courseRows];
  const appendSheetRow = vi.fn(async (_t, _r, row: string[]) => {
    rows = [...rows, row];
  });
  const deleteSheetRow = vi.fn(async (_t, _name, rowNumber: number) => {
    rows = rows.filter((_, index) => index !== rowNumber - 1);
  });
  const updateSheetValuesBatch = vi.fn(
    async (_t, updates: readonly { values: string[][] }[]) => {
      const next = updates[0]?.values[0];
      if (next) {
        rows = [rows[0], next, ...rows.slice(2)];
      }
    }
  );
  const readSheetValues = vi.fn(
    async (
      target: SpreadsheetTarget,
      range: string,
      _operation?: SheetsOperation
    ): Promise<string[][]> => {
      void _operation;
      if (target === 'access') {
        return [
          ['email', 'name'],
          [USER.email, 'Volunteer']
        ];
      }
      if (range === LAYOUT.coursesRange) {
        return rows;
      }
      if (range === LAYOUT.courseTemplatesRange) {
        return [
          ['courseType', 'template'],
          ['HP', 'Hi {name}']
        ];
      }
      if (range === LAYOUT.shortUrlsRange) {
        return shortUrlRows;
      }
      if (range === LAYOUT.campaignsRange) {
        return [
          ['id', 'name', 'type'],
          ['cmpLeads01AbcDefGhIJk', 'August', 'Leads']
        ];
      }
      if (range === LAYOUT.configRange) {
        return [
          ['key', 'value'],
          ['id', 'cfgMain01AbcDefGhIJK9'],
          ['campaignId', 'cmpLeads01AbcDefGhIJk'],
          ['centerWhatsappNumber', '919876543210']
        ];
      }
      return [];
    }
  );
  const readSheetValuesBatch = vi.fn(
    async (
      target: SpreadsheetTarget,
      ranges: readonly string[],
      operation?: SheetsOperation
    ): Promise<string[][][]> => {
      return Promise.all(
        ranges.map((range) => readSheetValues(target, range, operation))
      );
    }
  );

  return {
    store: createSheetsStore({
      readSheetValues,
      readSheetValuesBatch,
      updateSheetValuesBatch,
      appendSheetRow,
      deleteSheetRow,
      getSheetLayout: () => LAYOUT,
      now: () => new Date('2026-08-20T08:00:00.000Z'),
      imageStore
    }),
    readSheetValues,
    readSheetValuesBatch,
    appendSheetRow,
    deleteSheetRow
  };
}

describe('Sheets course store', () => {
  it('creates, updates, deactivates, and deletes a course row', async () => {
    const { store, appendSheetRow, deleteSheetRow } = createFixture([]);

    const created = await store.createCourseForAuthorizedUser(USER, {
      activityType: 'Course',
      courseType: 'HP',
      isActive: true
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course.courseType).toBe('HP');
    expect(created.value.course.title).toBe('HP');
    expect(created.value.course.id).toHaveLength(21);
    expect(appendSheetRow).toHaveBeenCalledOnce();

    const listed = await store.listCoursesForAuthorizedUser(USER);
    expect(listed.allowed && listed.value.courses).toHaveLength(1);

    const updated = await store.updateCourseForAuthorizedUser(USER, {
      id: created.value.course.id,
      activityType: 'Course',
      courseType: 'HP',
      title: created.value.course.title,
      whatsappTemplate: created.value.course.whatsappTemplate,
      isActive: false
    });
    expect(updated.allowed && updated.value.course.title).toBe('HP');
    expect(updated.allowed && updated.value.course.isActive).toBe(false);

    const publicInactive = await store.getPublicCourses('hp');
    expect(publicInactive.courses).toEqual([]);
    expect(publicInactive.selectionMatched).toBe(false);

    const deleted = await store.deleteCourseForAuthorizedUser(USER, {
      id: created.value.course.id
    });
    expect(deleted.allowed).toBe(true);
    expect(deleteSheetRow).toHaveBeenCalledOnce();
    await expect(store.getPublicCourses('hp')).resolves.toMatchObject({
      courses: [],
      selectionMatched: false
    });
  });

  it('authorizes course management without reading config or campaign sheets', async () => {
    const fixture = createFixture([courseRow()]);

    const listed = await fixture.store.listCoursesForAuthorizedUser(USER);

    expect(listed.allowed).toBe(true);
    expect(fixture.readSheetValuesBatch).not.toHaveBeenCalled();
    expect(fixture.readSheetValues).toHaveBeenCalledWith(
      'access',
      LAYOUT.allowedUsersRange,
      expect.anything()
    );
    expect(fixture.readSheetValues).toHaveBeenCalledWith(
      'data',
      LAYOUT.coursesRange,
      expect.anything()
    );
    expect(fixture.readSheetValues).toHaveBeenCalledWith(
      'data',
      LAYOUT.courseTemplatesRange,
      expect.anything()
    );
    expect(fixture.readSheetValues).not.toHaveBeenCalledWith(
      'data',
      LAYOUT.configRange,
      expect.anything()
    );
    expect(fixture.readSheetValues).not.toHaveBeenCalledWith(
      'data',
      LAYOUT.campaignsRange,
      expect.anything()
    );
  });

  it('keeps IP Junior and Senior as separate public programs', async () => {
    const { store } = createFixture([
      courseRow({
        id: 'crsIpJnr01AbcDefGhiJK',
        courseType: 'IP',
        programCode: 'j',
        title: 'IP',
        whatsappTemplate: 'Junior'
      }),
      courseRow({
        id: 'crsIpSnr01AbcDefGhiJK',
        courseType: 'IP',
        programCode: 's',
        title: 'IP',
        whatsappTemplate: 'Senior'
      })
    ]);

    const page = await store.getPublicCourses('ip-s');

    expect(page.selectionMatched).toBe(true);
    expect(page.selected).toMatchObject({
      programCode: 's',
      title: 'IP Senior'
    });
    expect(page.courses).toMatchObject([
      { programCode: 'j', title: 'IP Junior' },
      { programCode: 's', title: 'IP Senior' }
    ]);
  });

  it('returns the configured center WhatsApp number for the homepage catalog', async () => {
    const { store } = createFixture([
      courseRow({
        id: 'crsHpNcr01AbcDefGhiJK',
        courseType: 'HP',
        isActive: 'false'
      })
    ]);

    await expect(store.listPublicHomepageOffers()).resolves.toMatchObject({
      success: true,
      whatsappNumber: '919876543210'
    });
  });

  it('resolves active ShortUrls rows to safe redirect destinations', async () => {
    const { store, readSheetValues } = createFixture([]);

    await expect(store.getShortUrlDestination('/TU/RP/')).resolves.toBe(
      'https://example.com/full-registration-link?utm=short'
    );
    await expect(store.getShortUrlDestination('inactive')).resolves.toBeNull();
    await expect(store.getShortUrlDestination('unsafe')).resolves.toBeNull();
    await expect(store.getShortUrlDestination('missing')).resolves.toBeNull();
    expect(readSheetValues).toHaveBeenCalledWith(
      'data',
      LAYOUT.shortUrlsRange,
      expect.anything()
    );
  });

  it('stores event activities without exposing them as public courses', async () => {
    const { store } = createFixture([]);

    const created = await store.createCourseForAuthorizedUser(USER, {
      activityType: 'Event',
      title: 'Weekly Member Follow-up',
      whatsappTemplate: 'Hi {name}, join {course}.',
      isActive: true
    });

    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course).toMatchObject({
      activityType: 'Event',
      targetAudience: 'Members',
      courseType: '',
      title: 'Weekly Member Follow-up'
    });

    const listed = await store.listCoursesForAuthorizedUser(USER);
    expect(listed.allowed && listed.value.courses).toMatchObject([
      { activityType: 'Event', title: 'Weekly Member Follow-up' }
    ]);
    await expect(store.getPublicCourses('')).resolves.toMatchObject({
      selected: null,
      courses: [],
      selectionMatched: false
    });
  });

  it('keeps non-public image ids out of the public image URL', async () => {
    const { store } = createFixture([]);
    const imageBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const created = await store.createCourseForAuthorizedUser(USER, {
      activityType: 'Course',
      courseType: 'HP',
      imageBase64,
      imageMimeType: 'image/png'
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course.hasImage).toBe(true);
    expect(created.value.course.imageUrl).toBe('');
  });

  it('exposes a Blob HTTPS url as imageUrl', async () => {
    const blobUrl =
      'https://store123.public.blob.vercel-storage.com/courses/x/image.png';
    const imageStore: ImageStore = {
      upload: vi.fn(async () => blobUrl),
      download: vi.fn(async () => ({
        mimeType: 'image/png',
        bytes: Buffer.from('png')
      })),
      remove: vi.fn(async () => undefined),
      removeCourse: vi.fn(async () => undefined)
    };
    const { store } = createFixture([], imageStore);
    const imageBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const created = await store.createCourseForAuthorizedUser(USER, {
      activityType: 'Course',
      courseType: 'HP',
      imageBase64,
      imageMimeType: 'image/png'
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course.imageUrl).toBe(blobUrl);
  });

  it('rejects invalid image files without appending a row', async () => {
    const { store, appendSheetRow } = createFixture([courseRow()]);
    await expect(
      store.createCourseForAuthorizedUser(USER, {
        activityType: 'Course',
        courseType: 'HP',
        imageBase64: 'abc',
        imageMimeType: 'image/svg+xml'
      })
    ).rejects.toThrow();
    expect(appendSheetRow).not.toHaveBeenCalled();
  });

  it('deletes image blobs when the course row is deleted', async () => {
    const imageStore: ImageStore = {
      upload: vi.fn(async () => 'https://blob.example/courses/x/image.png'),
      download: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
      removeCourse: vi.fn(async () => undefined)
    };
    const { store } = createFixture(
      [
        courseRow({
          imageFileId: 'https://blob.example/courses/x/image.png'
        })
      ],
      imageStore
    );
    const deleted = await store.deleteCourseForAuthorizedUser(USER, {
      id: COURSE_ID
    });
    expect(deleted.allowed).toBe(true);
    expect(imageStore.removeCourse).toHaveBeenCalledWith(
      COURSE_ID,
      'https://blob.example/courses/x/image.png'
    );
  });
});
