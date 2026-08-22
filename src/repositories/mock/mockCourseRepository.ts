import type { CourseRepository } from '../contracts';
import { nanoid } from 'nanoid';
import {
  CreateCourseRequestSchema,
  CreateCourseResponseSchema,
  DeleteCourseRequestSchema,
  DeleteCourseResponseSchema,
  ListCoursesResponseSchema,
  UpdateCourseRequestSchema,
  UpdateCourseResponseSchema,
  type Course,
  type CreateCourseRequest,
  type CreateCourseResponse,
  type DeleteCourseRequest,
  type DeleteCourseResponse,
  type ListCoursesResponse,
  type UpdateCourseRequest,
  type UpdateCourseResponse
} from '../../../shared/contracts/appContracts';
import {
  defaultCourseTemplates,
  formatCourseTitle,
  publicCoursePamphletPath,
  templateForCourseType
} from '../../../shared/contracts/courseDefaults.mjs';
import { mockCourses } from './mockCourses';

function toCourse(
  parsed: CreateCourseRequest | UpdateCourseRequest,
  options: { id: string; existing?: Course }
): Course {
  const hasUpload = Boolean(parsed.pamphletBase64.trim());
  const hasPamphlet = hasUpload || Boolean(options.existing?.hasPamphlet);
  return {
    id: options.id,
    courseType: parsed.courseType,
    programCode: parsed.programCode || '',
    title: formatCourseTitle(parsed.courseType, parsed.programCode),
    whatsappTemplate:
      parsed.whatsappTemplate.trim() ||
      options.existing?.whatsappTemplate ||
      templateForCourseType(parsed.courseType, parsed.programCode),
    isActive: parsed.isActive,
    hasPamphlet,
    pamphletImageUrl: hasUpload
      ? 'data:' +
        (parsed.pamphletMimeType || 'image/jpeg') +
        ';base64,' +
        parsed.pamphletBase64
      : options.existing?.pamphletImageUrl ||
        (hasPamphlet ? publicCoursePamphletPath(options.id) : ''),
    createdAt: options.existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: options.existing?.createdBy || 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  };
}

export class MockCourseRepository implements CourseRepository {
  private courses: Course[] = structuredClone(mockCourses);

  async listCourses(): Promise<ListCoursesResponse> {
    return ListCoursesResponseSchema.parse({
      success: true,
      courses: this.courses.map((course) => ({ ...course })),
      templates: defaultCourseTemplates()
    });
  }

  async createCourse(
    payload: CreateCourseRequest
  ): Promise<CreateCourseResponse> {
    const parsed = CreateCourseRequestSchema.parse(payload);
    const course = toCourse(parsed, { id: nanoid() });
    this.courses.push(course);
    return CreateCourseResponseSchema.parse({ success: true, course });
  }

  async updateCourse(
    payload: UpdateCourseRequest
  ): Promise<UpdateCourseResponse> {
    const parsed = UpdateCourseRequestSchema.parse(payload);
    const index = this.courses.findIndex((course) => course.id === parsed.id);
    if (index < 0) {
      throw new Error('Course not found.');
    }
    const course = toCourse(parsed, {
      id: parsed.id,
      existing: this.courses[index]
    });
    this.courses[index] = course;
    return UpdateCourseResponseSchema.parse({ success: true, course });
  }

  async deleteCourse(
    payload: DeleteCourseRequest
  ): Promise<DeleteCourseResponse> {
    const parsed = DeleteCourseRequestSchema.parse(payload);
    const index = this.courses.findIndex((course) => course.id === parsed.id);
    if (index < 0) {
      throw new Error('Course not found.');
    }
    this.courses.splice(index, 1);
    return DeleteCourseResponseSchema.parse({
      success: true,
      course: { id: parsed.id }
    });
  }
}
