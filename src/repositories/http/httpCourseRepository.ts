import type { CourseRepository } from '../contracts';
import {
  CreateCourseRequestSchema,
  CreateCourseResponseSchema,
  DeleteCourseRequestSchema,
  DeleteCourseResponseSchema,
  ListCoursesResponseSchema,
  UpdateCourseRequestSchema,
  UpdateCourseResponseSchema,
  type CreateCourseRequest,
  type CreateCourseResponse,
  type DeleteCourseRequest,
  type DeleteCourseResponse,
  type ListCoursesResponse,
  type UpdateCourseRequest,
  type UpdateCourseResponse
} from '../../../shared/contracts/appContracts';
import { ApiClient } from '../../services/apiClient';

export class HttpCourseRepository implements CourseRepository {
  constructor(private readonly apiClient: ApiClient) {}

  async listCourses(): Promise<ListCoursesResponse> {
    const response = await this.apiClient.get<unknown>('/api/courses');
    return ListCoursesResponseSchema.parse(response);
  }

  async createCourse(
    payload: CreateCourseRequest
  ): Promise<CreateCourseResponse> {
    const parsed = CreateCourseRequestSchema.parse(payload);
    const response = await this.apiClient.post<unknown>(
      '/api/courses',
      parsed
    );
    return CreateCourseResponseSchema.parse(response);
  }

  async updateCourse(
    payload: UpdateCourseRequest
  ): Promise<UpdateCourseResponse> {
    const parsed = UpdateCourseRequestSchema.parse(payload);
    const response = await this.apiClient.put<unknown>(
      '/api/courses/' + encodeURIComponent(parsed.id),
      parsed
    );
    return UpdateCourseResponseSchema.parse(response);
  }

  async deleteCourse(
    payload: DeleteCourseRequest
  ): Promise<DeleteCourseResponse> {
    const parsed = DeleteCourseRequestSchema.parse(payload);
    const response = await this.apiClient.delete<unknown>(
      '/api/courses/' + encodeURIComponent(parsed.id),
      parsed
    );
    return DeleteCourseResponseSchema.parse(response);
  }
}
