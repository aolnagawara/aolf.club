import { describe, expect, it, vi } from 'vitest';
import { createSheetsStore } from '../../../api/_lib/sheets/store.js';
import {
  createMemoryPamphletStore,
  type PamphletStore
} from '../../../api/_lib/courses/pamphletStore.js';
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
  coursesRange: 'Courses!A:Z',
  courseTemplatesRange: 'CourseTemplates!A:B',
  configRange: 'Config!A:B',
  allowedUsersRange: 'AllowedUsers!A:Z'
};

function courseRow(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    id: COURSE_ID,
    courseType: 'HP',
    programCode: '',
    title: 'HP',
    whatsappTemplate: 'Hi {name}',
    pamphletFileId: '',
    pamphletMimeType: '',
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
  pamphletStore: PamphletStore = createMemoryPamphletStore()
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
          ['HP', 'Hi {name} {courseUrl}']
        ];
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
          ['campaignId', 'cmpLeads01AbcDefGhIJk']
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
      pamphletStore
    }),
    appendSheetRow,
    deleteSheetRow
  };
}

describe('Sheets course store', () => {
  it('creates, updates, deactivates, and deletes a course row', async () => {
    const { store, appendSheetRow, deleteSheetRow } = createFixture([]);

    const created = await store.createCourseForAuthorizedUser(USER, {
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
      courseType: 'HP',
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

  it('stores an uploaded pamphlet and serves it from the public reader', async () => {
    const { store } = createFixture([]);
    const pamphletBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const created = await store.createCourseForAuthorizedUser(USER, {
      courseType: 'HP',
      pamphletBase64,
      pamphletMimeType: 'image/png'
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course.hasPamphlet).toBe(true);
    expect(created.value.course.pamphletImageUrl).toBe(
      '/course/' + created.value.course.id + '/pamphlet'
    );
    const pamphlet = await store.getPublicCoursePamphlet(
      created.value.course.id
    );
    expect(pamphlet?.mimeType).toBe('image/png');
    expect(pamphlet?.bytes.length).toBeGreaterThan(0);
  });

  it('exposes a Blob HTTPS url as pamphletImageUrl', async () => {
    const blobUrl =
      'https://store123.public.blob.vercel-storage.com/courses/x/pamphlet.png';
    const pamphletStore: PamphletStore = {
      upload: vi.fn(async () => blobUrl),
      download: vi.fn(async () => ({
        mimeType: 'image/png',
        bytes: Buffer.from('png')
      })),
      remove: vi.fn(async () => undefined),
      removeCourse: vi.fn(async () => undefined)
    };
    const { store } = createFixture([], pamphletStore);
    const pamphletBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const created = await store.createCourseForAuthorizedUser(USER, {
      courseType: 'HP',
      pamphletBase64,
      pamphletMimeType: 'image/png'
    });
    expect(created.allowed).toBe(true);
    if (!created.allowed) {
      return;
    }
    expect(created.value.course.pamphletImageUrl).toBe(blobUrl);
  });

  it('rejects invalid pamphlet files without appending a row', async () => {
    const { store, appendSheetRow } = createFixture([courseRow()]);
    await expect(
      store.createCourseForAuthorizedUser(USER, {
        courseType: 'HP',
        pamphletBase64: 'abc',
        pamphletMimeType: 'image/svg+xml'
      })
    ).rejects.toThrow();
    expect(appendSheetRow).not.toHaveBeenCalled();
  });

  it('deletes pamphlet blobs when the course row is deleted', async () => {
    const pamphletStore: PamphletStore = {
      upload: vi.fn(async () => 'https://blob.example/courses/x/pamphlet.png'),
      download: vi.fn(async () => null),
      remove: vi.fn(async () => undefined),
      removeCourse: vi.fn(async () => undefined)
    };
    const { store } = createFixture(
      [
        courseRow({
          pamphletFileId: 'https://blob.example/courses/x/pamphlet.png'
        })
      ],
      pamphletStore
    );
    const deleted = await store.deleteCourseForAuthorizedUser(USER, {
      id: COURSE_ID
    });
    expect(deleted.allowed).toBe(true);
    expect(pamphletStore.removeCourse).toHaveBeenCalledWith(
      COURSE_ID,
      'https://blob.example/courses/x/pamphlet.png'
    );
  });
});
