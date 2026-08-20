export const DEFAULT_COURSE_WHATSAPP_TEMPLATE: string;
export const DEFAULT_HP_WHATSAPP_TEMPLATE: string;
export const DEFAULT_COURSE_TEMPLATE_TYPES: readonly string[];

export function normalizeCourseType(value: string): string;
export function templateForCourseType(courseType: string): string;
export function defaultCourseTemplateRows(): string[][];
export function currentCourseMonth(now?: Date): string;
export function formatCourseMonthLabel(month: string): string;
export function formatCourseTitle(courseType: string, month: string): string;
export function publicCoursePamphletPath(id: string): string;
export function defaultCourseTemplates(): Array<{
  courseType: string;
  template: string;
}>;
