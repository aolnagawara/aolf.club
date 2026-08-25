import { createSevaWorkspaceInitialState } from './state';
import { createAuthAndBootstrapMethods } from './authAndBootstrap';
import { createLeadLifecycleMethods } from './leadLifecycle';
import { createProgramMethods } from './programs';
import { createDateAndFilterMethods } from './dateAndFilter';
import { createUiMethods } from './uiMethods';
import { createCommunicationMethods } from './communications';
import { createRecordActionMethods } from './recordActions';
import type { SevaWorkspaceContext, Lead } from './types';
import type {
  Course,
  CourseTemplate
} from '../../../shared/contracts/appContracts';
import {
  activityAudience,
  formatCourseTitle,
  isCourseActivity,
  isEventActivity,
  isIpCourseType,
  normalizeCourseType,
  programsForCourseType,
  publicCourseImagePath,
  templateForCourseType,
  templateLookupKeys
} from '../../../shared/contracts/courseDefaults.mjs';

type CourseWorkspaceMethods =
  ReturnType<
    typeof import('../courses/courseWorkspace')['createCourseWorkspaceMethods']
  >;

let courseWorkspaceMethodsPromise: Promise<CourseWorkspaceMethods> | null =
  null;

function matchingCoursesForLead(
  lead: Lead | null | undefined,
  active: readonly Course[]
): Course[] {
  if (lead?.campaignType === 'Members') {
    return active.filter((course) => isEventActivity(course));
  }

  const programs = (lead?.wishlistPrograms || [])
    .map((item) =>
      String(item || '')
        .trim()
        .toUpperCase()
    )
    .filter(Boolean);
  if (!programs.length) {
    return [...active];
  }
  return active.filter((course) =>
    programs.includes(normalizeCourseType(course.courseType).toUpperCase())
  );
}

function imageExtension(imageUrl: string): string {
  const normalized = imageUrl.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'png';
  }
  if (normalized.endsWith('.webp')) {
    return 'webp';
  }
  return 'jpg';
}

function fileSafeName(value: string): string {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'activity-image'
  );
}

function templateFromList(
  courseType: string,
  programCode: string,
  templates: readonly CourseTemplate[]
): string {
  const keys = templateLookupKeys(courseType, programCode);
  for (const key of keys) {
    const match = templates.find(
      (item) =>
        item.courseType.trim().toUpperCase() === key.trim().toUpperCase()
    );
    if (match?.template) {
      return match.template;
    }
  }
  return templateForCourseType(courseType, programCode);
}

async function loadCourseWorkspaceMethods(): Promise<CourseWorkspaceMethods> {
  if (!courseWorkspaceMethodsPromise) {
    courseWorkspaceMethodsPromise = import('../courses/courseWorkspace').then(
      ({ createCourseWorkspaceMethods }) => createCourseWorkspaceMethods()
    );
  }
  return courseWorkspaceMethodsPromise;
}

async function installCourseWorkspaceMethods(
  context: SevaWorkspaceContext
): Promise<CourseWorkspaceMethods> {
  const methods = await loadCourseWorkspaceMethods();
  Object.assign(context, methods);
  return methods;
}

function lazyCourseMethod(name: keyof CourseWorkspaceMethods) {
  return async function (
    this: SevaWorkspaceContext,
    ...args: unknown[]
  ): Promise<unknown> {
    const methods = await installCourseWorkspaceMethods(this);
    return (methods[name] as (...methodArgs: unknown[]) => unknown).apply(
      this,
      args
    );
  };
}

function createLazyCourseWorkspaceMethods() {
  return {
    activeCourses(this: SevaWorkspaceContext, lead?: Lead | null): Course[] {
      const audience = lead?.campaignType || this.campaignType;
      return this.courses.filter(
        (course) =>
          course.isActive && activityAudience(course.activityType) === audience
      );
    },
    pickerCourses(this: SevaWorkspaceContext, lead?: Lead | null): Course[] {
      const active = this.activeCourses(lead);
      const matching = matchingCoursesForLead(lead, active);
      return matching.length ? matching : active;
    },
    coursePickerOptions(this: SevaWorkspaceContext): Course[] {
      const options: Course[] = this.pickerCourses(this.coursePickerLead);
      return this.coursePickerMode === 'imageShare'
        ? options.filter((course: Course) => course.hasImage)
        : options;
    },
    coursePickerTitle(this: SevaWorkspaceContext): string {
      return this.coursePickerMode === 'imageShare'
        ? 'Share which image?'
        : 'Select activity';
    },
    courseImageUrl(course: Course): string {
      if (!course.id || !course.hasImage) {
        return '';
      }
      const stored = String(course.imageUrl || '').trim();
      return /^https:\/\//i.test(stored)
        ? stored
        : publicCourseImagePath(course.id);
    },
    courseImageDownloadName(
      this: SevaWorkspaceContext,
      course: Course
    ): string {
      return (
        'aolf-' +
        fileSafeName(this.courseDisplayTitle(course)) +
        '.' +
        imageExtension(course.imageUrl || '')
      );
    },
    ipPrograms() {
      return programsForCourseType('IP');
    },
    isCourseDraftEvent(this: SevaWorkspaceContext): boolean {
      return this.courseDraft.activityType === 'Event';
    },
    showsProgramTabs(this: SevaWorkspaceContext): boolean {
      return (
        this.courseDraft.activityType === 'Course' &&
        isIpCourseType(this.courseDraft.courseType)
      );
    },
    courseDisplayTitle(this: SevaWorkspaceContext, course: Course): string {
      if (isEventActivity(course)) {
        return course.title || 'Event';
      }
      if (isIpCourseType(course.courseType)) {
        return formatCourseTitle(course.courseType, course.programCode);
      }
      const programs =
        this.appConfig.programs.length > 0
          ? this.appConfig.programs
          : this.defaultPrograms;
      return (
        programs.find((item) => item.code === course.courseType)?.label ||
        course.courseType
      );
    },
    coursePickerSubtitle(this: SevaWorkspaceContext, course: Course): string {
      if (isEventActivity(course)) {
        return 'Event';
      }
      const displayTitle = this.courseDisplayTitle(course);
      const title = String(course.title || '').trim();
      return title && title !== displayTitle ? title : '';
    },
    courseCardSubtitle(course: Course): string {
      return isEventActivity(course)
        ? 'Event · Members'
        : (course.courseType || 'Course') + ' · Leads';
    },
    canOpenPublicCoursePage(course: Course): boolean {
      return isCourseActivity(course);
    },
    templateForType(
      this: SevaWorkspaceContext,
      courseType: string,
      programCode = ''
    ): string {
      return templateFromList(courseType, programCode, this.courseTemplates);
    },
    onActivityTypeChange: lazyCourseMethod('onActivityTypeChange'),
    onCourseTypeChange: lazyCourseMethod('onCourseTypeChange'),
    onProgramCodeChange: lazyCourseMethod('onProgramCodeChange'),
    onImageSelected: lazyCourseMethod('onImageSelected'),
    clearCourseImage: lazyCourseMethod('clearCourseImage'),
    switchWorkspaceView: lazyCourseMethod('switchWorkspaceView'),
    loadCourses: lazyCourseMethod('loadCourses'),
    openCourseEditor: lazyCourseMethod('openCourseEditor'),
    closeCourseEditor: lazyCourseMethod('closeCourseEditor'),
    openPublicCoursePage: lazyCourseMethod('openPublicCoursePage'),
    fetchCourseImageFile: lazyCourseMethod('fetchCourseImageFile'),
    copyCourseImageToClipboard: lazyCourseMethod('copyCourseImageToClipboard'),
    shareCourseImage: lazyCourseMethod('shareCourseImage'),
    downloadCourseImage: lazyCourseMethod('downloadCourseImage'),
    saveCourse: lazyCourseMethod('saveCourse'),
    toggleCourseActive: lazyCourseMethod('toggleCourseActive'),
    deleteCourse: lazyCourseMethod('deleteCourse'),
    closeCoursePicker: lazyCourseMethod('closeCoursePicker'),
    openWhatsappWithCourse: lazyCourseMethod('openWhatsappWithCourse'),
    openWhatsappForLead: lazyCourseMethod('openWhatsappForLead'),
    openImageShareForLead: lazyCourseMethod('openImageShareForLead'),
    selectCourseFromPicker: lazyCourseMethod('selectCourseFromPicker')
  };
}

export function sevaWorkspace(): SevaWorkspaceContext {
  return {
    ...createSevaWorkspaceInitialState(),
    ...createAuthAndBootstrapMethods(),
    ...createLeadLifecycleMethods(),
    ...createProgramMethods(),
    ...createDateAndFilterMethods(),
    ...createUiMethods(),
    ...createRecordActionMethods(),
    ...createCommunicationMethods(),
    ...createLazyCourseWorkspaceMethods()
  };
}
