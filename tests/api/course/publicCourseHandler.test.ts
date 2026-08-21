import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '../../../api/_lib/http/responses.js';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getPublicCourseById: vi.fn(),
    getPublicCoursePage: vi.fn(),
    getPublicCoursePamphlet: vi.fn()
  }
}));

vi.mock('../../../api/_lib/storage/dataStore.js', () => ({
  getApiDataStore: () => mockStore
}));

import publicCourseHandler from '../../../api/course/[id].js';

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

  it('serves pamphlet bytes when asset=pamphlet', async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    mockStore.getPublicCoursePamphlet.mockResolvedValue({
      mimeType: 'image/png',
      bytes
    });
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { id: COURSE_ID, asset: 'pamphlet' }
      },
      response
    );
    expect(state.statusCode).toBe(200);
    expect(state.headers['content-type']).toBe('image/png');
    expect(state.endBody).toBe(bytes);
  });

  it('returns 404 when the pamphlet is missing', async () => {
    mockStore.getPublicCoursePamphlet.mockResolvedValue(null);
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { id: COURSE_ID, asset: 'pamphlet' }
      },
      response
    );
    expect(state.statusCode).toBe(404);
    expect(state.endBody).toBe('Pamphlet not found.');
  });

  it('looks up a public course by type slug', async () => {
    const course = {
      id: COURSE_ID,
      courseType: 'HP',
      programCode: '',
      title: 'HP',
      whatsappTemplate: '*Hello*',
      hasPamphlet: false,
      pamphletImageUrl: '',
      publicPath: '/c/hp'
    };
    mockStore.getPublicCoursePage.mockResolvedValue({
      selected: course,
      family: [course]
    });
    const { response, state } = createResponse();
    await publicCourseHandler(
      {
        method: 'GET',
        headers: { host: 'aolf.club' },
        query: { id: 'hp' }
      },
      response
    );
    expect(mockStore.getPublicCoursePage).toHaveBeenCalledWith('hp');
    expect(state.statusCode).toBe(200);
    expect(String(state.endBody)).toContain('content="https://aolf.club/c/hp"');
    expect(String(state.endBody)).toContain('<strong>Hello</strong>');
  });
});
