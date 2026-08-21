import {
  CourseSchema,
  type Course,
  type CreateCourseRequest,
  type UpdateCourseRequest
} from '../../../shared/contracts/appContracts.js';
import { isHttpsUrl } from './blobPamphlet.js';
import {
  courseSlotKey,
  formatCourseTitle,
  normalizeProgramCode,
  publicCoursePamphletPath,
  publicCoursePath,
  templateForCourseType
} from '../../../shared/contracts/courseDefaults.mjs';
import { SHEET_HEADERS } from '../../../shared/contracts/sheetContract.mjs';
import { findHeaderIndex } from '../sheets/table.js';

const COURSE_HEADERS = SHEET_HEADERS.courses;

export function pamphletPublicUrl(
  courseId: string,
  pamphletFileId: string
): string {
  const stored = String(pamphletFileId || '').trim();
  if (!stored) {
    return '';
  }
  if (isHttpsUrl(stored)) {
    return stored;
  }
  return publicCoursePamphletPath(courseId);
}

export type CourseRecord = Course & {
  pamphletFileId: string;
  pamphletMimeType: string;
};

function parseBooleanCell(raw: string | undefined, fallback = true): boolean {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

export function toCourseResponse(record: CourseRecord): Course {
  const programCode = normalizeProgramCode(
    record.courseType,
    record.programCode
  );
  return CourseSchema.parse({
    id: record.id,
    courseType: record.courseType,
    programCode,
    title: record.title,
    whatsappTemplate: record.whatsappTemplate,
    isActive: record.isActive,
    hasPamphlet: Boolean(record.pamphletFileId),
    pamphletImageUrl: pamphletPublicUrl(record.id, record.pamphletFileId),
    publicPath: publicCoursePath(record.courseType, programCode),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy
  });
}

export function applyCourseDefaults(
  input: CreateCourseRequest | UpdateCourseRequest,
  timestamp: string,
  actorEmail: string,
  options: {
    id: string;
    existing?: CourseRecord;
    pamphletFileId?: string;
    pamphletMimeType?: string;
  }
): CourseRecord {
  const courseType = String(input.courseType || '').trim();
  const programCode = normalizeProgramCode(courseType, input.programCode);
  const pamphletFileId =
    options.pamphletFileId ?? options.existing?.pamphletFileId ?? '';
  const pamphletMimeType =
    options.pamphletMimeType ?? options.existing?.pamphletMimeType ?? '';
  const record: CourseRecord = {
    id: options.id,
    courseType,
    programCode,
    title: formatCourseTitle(courseType, programCode),
    whatsappTemplate:
      String(input.whatsappTemplate || '').trim() ||
      options.existing?.whatsappTemplate ||
      templateForCourseType(courseType, programCode),
    isActive: input.isActive,
    hasPamphlet: Boolean(pamphletFileId),
    pamphletImageUrl: pamphletPublicUrl(options.id, pamphletFileId),
    publicPath: publicCoursePath(courseType, programCode),
    createdAt: options.existing?.createdAt || timestamp,
    updatedAt: timestamp,
    createdBy: options.existing?.createdBy || actorEmail,
    updatedBy: actorEmail,
    pamphletFileId,
    pamphletMimeType
  };
  return {
    ...toCourseResponse(record),
    pamphletFileId,
    pamphletMimeType
  };
}

export function courseFromRow(
  headers: string[],
  row: string[]
): CourseRecord | null {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (header) {
      record[header] = String(row[index] || '').trim();
    }
  });
  const courseType = record.courseType || '';
  const programCode = normalizeProgramCode(courseType, record.programCode);
  if (!record.id || !courseType) {
    return null;
  }
  try {
    return applyCourseDefaults(
      {
        courseType,
        programCode,
        whatsappTemplate: record.whatsappTemplate || '',
        isActive: parseBooleanCell(record.isActive, true),
        pamphletBase64: '',
        pamphletMimeType: record.pamphletMimeType || ''
      },
      record.updatedAt || record.createdAt || '',
      record.updatedBy || record.createdBy || '',
      {
        id: record.id,
        pamphletFileId: record.pamphletFileId || '',
        pamphletMimeType: record.pamphletMimeType || '',
        existing: {
          id: record.id,
          courseType,
          programCode,
          title: record.title || formatCourseTitle(courseType, programCode),
          whatsappTemplate: record.whatsappTemplate || '',
          isActive: parseBooleanCell(record.isActive, true),
          hasPamphlet: Boolean(record.pamphletFileId),
          pamphletImageUrl: '',
          publicPath: publicCoursePath(courseType, programCode),
          createdAt: record.createdAt || '',
          updatedAt: record.updatedAt || '',
          createdBy: record.createdBy || '',
          updatedBy: record.updatedBy || '',
          pamphletFileId: record.pamphletFileId || '',
          pamphletMimeType: record.pamphletMimeType || ''
        }
      }
    );
  } catch {
    return null;
  }
}

export function courseToRow(headers: string[], course: CourseRecord): string[] {
  const cells: Record<string, string> = {
    id: course.id,
    courseType: course.courseType || '',
    programCode: normalizeProgramCode(course.courseType, course.programCode),
    title: course.title || '',
    whatsappTemplate: course.whatsappTemplate || '',
    pamphletFileId: course.pamphletFileId || '',
    pamphletMimeType: course.pamphletMimeType || '',
    isActive: course.isActive ? 'true' : 'false',
    createdAt: course.createdAt || '',
    updatedAt: course.updatedAt || '',
    createdBy: course.createdBy || '',
    updatedBy: course.updatedBy || ''
  };
  return headers.map((header) => cells[header] || '');
}

export function resolveCourseIdColumn(headers: string[]): number {
  return findHeaderIndex(headers, ['id']);
}

export function expectedCourseHeaders(): readonly string[] {
  return COURSE_HEADERS;
}

export function hasDuplicateCourseSlot(
  courses: readonly { id?: string; courseType?: string; programCode?: string }[],
  candidate: { id?: string; courseType: string; programCode?: string }
): boolean {
  const wanted = courseSlotKey(candidate.courseType, candidate.programCode);
  return courses.some(
    (course) =>
      course.id !== candidate.id &&
      courseSlotKey(course.courseType || '', course.programCode) === wanted
  );
}

export function templatesFromRows(rows: string[][]): Array<{
  courseType: string;
  template: string;
}> {
  const headers = (rows[0] || []).map((value) => String(value || '').trim());
  const typeIndex = findHeaderIndex(headers, ['courseType']);
  const templateIndex = findHeaderIndex(headers, ['template']);
  if (typeIndex < 0 || templateIndex < 0) {
    return [];
  }
  return rows
    .slice(1)
    .map((row) => ({
      courseType: String(row[typeIndex] || '').trim(),
      template: String(row[templateIndex] || '')
    }))
    .filter((item) => item.courseType);
}
