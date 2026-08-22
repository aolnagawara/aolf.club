export const DEFAULT_COURSE_WHATSAPP_TEMPLATE: string;
export const DEFAULT_HP_WHATSAPP_TEMPLATE: string;
export const DEFAULT_COURSE_TEMPLATE_TYPES: readonly string[];
export const IP_COURSE_PROGRAMS: readonly {
  readonly code: string;
  readonly label: string;
}[];

export function normalizeCourseType(value: string): string;
export function isIpCourseType(courseType: string): boolean;
export function programsForCourseType(
  courseType: string
): Array<{ code: string; label: string }>;
export function normalizeProgramCode(
  courseType: string,
  programCode?: string
): string;
export function programLabelFor(
  courseType: string,
  programCode?: string
): string;
export function courseSlotKey(courseType: string, programCode?: string): string;
export function templateLookupKeys(
  courseType: string,
  programCode?: string
): string[];
export function templateForCourseType(
  courseType: string,
  programCode?: string
): string;
export function defaultCourseTemplateRows(): string[][];
export function formatCourseTitle(
  courseType: string,
  programCode?: string
): string;
export function publicCoursePamphletPath(id: string): string;
export function publicCourseProgramKey(
  courseType: string,
  programCode?: string
): string;
export function publicCoursesPath(programKey?: string): string;
export function selectActivePublicCourses<
  T extends {
    courseType?: string;
    programCode?: string;
    isActive?: boolean;
  }
>(
  courses: T[],
  programKey?: string
): { selected: T | null; courses: T[]; selectionMatched: boolean };
export function defaultCourseTemplates(): Array<{
  courseType: string;
  template: string;
}>;
export const HOMEPAGE_PROGRAM_OFFERS: readonly {
  readonly code: string;
  readonly label: string;
}[];
export function homepageProgramOffers(
  courses: Array<{
    courseType?: string;
    isActive?: boolean;
    programCode?: string;
  }>
): Array<{
  code: string;
  label: string;
  active: boolean;
  registerPath: string;
}>;
