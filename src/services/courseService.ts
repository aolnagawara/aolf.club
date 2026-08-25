import { env } from '../config/env';
import type { CourseRepository } from '../repositories/contracts';
import { HttpCourseRepository } from '../repositories/http/httpCourseRepository';
import { ApiClient } from './apiClient';
import type {
  CreateCourseRequest,
  DeleteCourseRequest,
  UpdateCourseRequest
} from '../../shared/contracts/appContracts';

const httpCourseRepository = new HttpCourseRepository(
  new ApiClient(env.VITE_API_BASE_URL || '')
);
let mockCourseRepositoryPromise: Promise<CourseRepository> | null = null;

async function getRepository(): Promise<CourseRepository> {
  if (env.VITE_APP_MODE === 'api') {
    return httpCourseRepository;
  }
  if (!mockCourseRepositoryPromise) {
    mockCourseRepositoryPromise = import(
      '../repositories/mock/mockCourseRepository'
    ).then(({ MockCourseRepository }) => new MockCourseRepository());
  }
  return mockCourseRepositoryPromise;
}

export const courseService = {
  async listCourses() {
    return (await getRepository()).listCourses();
  },
  async createCourse(payload: CreateCourseRequest) {
    return (await getRepository()).createCourse(payload);
  },
  async updateCourse(payload: UpdateCourseRequest) {
    return (await getRepository()).updateCourse(payload);
  },
  async deleteCourse(payload: DeleteCourseRequest) {
    return (await getRepository()).deleteCourse(payload);
  }
};
