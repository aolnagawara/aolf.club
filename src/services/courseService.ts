import { env } from '../config/env';
import type { CourseRepository } from '../repositories/contracts';
import { MockCourseRepository } from '../repositories/mock/mockCourseRepository';
import { HttpCourseRepository } from '../repositories/http/httpCourseRepository';
import { ApiClient } from './apiClient';
import type {
  CreateCourseRequest,
  DeleteCourseRequest,
  UpdateCourseRequest
} from '../../shared/contracts/appContracts';

function createRepository(): CourseRepository {
  if (env.VITE_APP_MODE === 'api') {
    return new HttpCourseRepository(new ApiClient(env.VITE_API_BASE_URL || ''));
  }
  return new MockCourseRepository();
}

const courseRepository = createRepository();

export const courseService = {
  listCourses() {
    return courseRepository.listCourses();
  },
  createCourse(payload: CreateCourseRequest) {
    return courseRepository.createCourse(payload);
  },
  updateCourse(payload: UpdateCourseRequest) {
    return courseRepository.updateCourse(payload);
  },
  deleteCourse(payload: DeleteCourseRequest) {
    return courseRepository.deleteCourse(payload);
  }
};
