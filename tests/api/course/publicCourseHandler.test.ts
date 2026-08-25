import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '../../../api/_lib/http/responses.js';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getPublicCourses: vi.fn(),
    getPublicCourseImage: vi.fn()
  }
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import publicCourseHandler from '../../../api/public-courses.js';

const COURSE_ID = 'crsHpNcr01AbcDefGhiJK';

function createResponse() {
  const state: {
    statusCode: number;
    headers: Record<string, string | string[]>;
    endBody: string | Buffer | Uint8Array | undefined;
  } = {
    statusCode: 0,
    headers: {},
    endBody: undefined
  };
  const response: ApiResponse = {
    status(code) {
      state.statusCode = code;
      return response;
    },
    json() {
      return response;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return state.headers[name.toLowerCase()];
    },
    end(body) {
      state.endBody = body;
    }
  };
  return { response, state };
}

describe('public course handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves image bytes when asset=image', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    mockStore.getPublicCourseImage.mockResolvedValue({
      mimeType: 'image/png',
      bytes
    });
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { id: COURSE_ID, asset: 'image' }
      },
      response
    );
    expect(state.statusCode).toBe(200);
    expect(state.headers['content-type']).toBe('image/png');
    expect(state.endBody).toBe(bytes);
  });

  it('returns 404 when the image is missing', async () => {
    mockStore.getPublicCourseImage.mockResolvedValue(null);
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { id: COURSE_ID, asset: 'image' }
      },
      response
    );
    expect(state.statusCode).toBe(404);
    expect(state.endBody).toBe('Image not found.');
  });

  it('renders a selected program on the unified courses page', async () => {
    const course = {
      id: COURSE_ID,
      courseType: 'HP',
      programCode: '',
      title: 'HP',
      whatsappTemplate: '*Hello*',
      isActive: true,
      hasImage: false,
      imageUrl: ''
    };
    mockStore.getPublicCourses.mockResolvedValue({
      selected: course,
      courses: [course],
      selectionMatched: true
    });
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { program: 'hp' }
      },
      response
    );
    expect(mockStore.getPublicCourses).toHaveBeenCalledWith('hp');
    expect(state.statusCode).toBe(200);
    expect(String(state.endBody)).toContain(
      '<link rel="canonical" href="https://aolf.club/courses?program=hp"'
    );
    expect(String(state.endBody)).not.toContain('property="og:');
    expect(String(state.endBody)).toContain('<article class="course-layout">');
    expect(String(state.endBody)).toContain('<strong>Hello</strong>');
  });
});
