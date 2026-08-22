import type { SevaWorkspaceContext, CourseDraft, Lead } from '../seva/types';
import type {
  Course,
  CourseTemplate
} from '../../../shared/contracts/appContracts';
import { toUserErrorMessage } from '../../services/apiClient';
import { createEmptyCourseDraft } from '../seva/state';
import { findUniqueActiveCourse } from '../../../shared/contracts/courseMatching';
import {
  formatCourseTitle,
  isIpCourseType,
  normalizeCourseType,
  normalizeProgramCode,
  programLabelFor,
  programsForCourseType,
  publicCourseProgramKey,
  publicCoursesPath,
  templateForCourseType,
  templateLookupKeys
} from '../../../shared/contracts/courseDefaults.mjs';
import {
  inspectPamphletUpload,
  MAX_PAMPHLET_BYTES,
  PAMPHLET_SIZE_ERROR
} from '../../../shared/contracts/pamphlet';

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

function courseToDraft(course: Course): CourseDraft {
  return {
    id: course.id,
    courseType: course.courseType || '',
    programCode: course.programCode || '',
    whatsappTemplate: course.whatsappTemplate || '',
    isActive: course.isActive,
    hasPamphlet: Boolean(course.hasPamphlet),
    clearPamphlet: false,
    pamphletBase64: '',
    pamphletMimeType: '',
    pamphletPreviewUrl: course.hasPamphlet
      ? course.pamphletImageUrl ||
        '/course/' + encodeURIComponent(course.id) + '/pamphlet'
      : ''
  };
}

export function createCourseWorkspaceMethods() {
  return {
    activeCourses(this: SevaWorkspaceContext): Course[] {
      return this.courses.filter((course) => course.isActive);
    },
    pickerCourses(this: SevaWorkspaceContext, lead?: Lead | null): Course[] {
      const active = this.activeCourses();
      const programs = (lead?.wishlistPrograms || [])
        .map((item) =>
          String(item || '')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean);
      if (!programs.length) {
        return active;
      }
      const matching = active.filter((course: Course) =>
        programs.includes(normalizeCourseType(course.courseType).toUpperCase())
      );
      return matching.length ? matching : active;
    },
    ipPrograms() {
      return programsForCourseType('IP');
    },
    showsProgramTabs(this: SevaWorkspaceContext): boolean {
      return isIpCourseType(this.courseDraft.courseType);
    },
    courseDisplayTitle(this: SevaWorkspaceContext, course: Course): string {
      const programs =
        this.appConfig.programs.length > 0
          ? this.appConfig.programs
          : this.defaultPrograms;
      const label =
        programs.find((item) => item.code === course.courseType)?.label ||
        course.courseType;
      const program = programLabelFor(course.courseType, course.programCode);
      return program ? label + ' · ' + program : label;
    },
    coursePickerSubtitle(this: SevaWorkspaceContext, course: Course): string {
      const displayTitle = this.courseDisplayTitle(course);
      const title = String(course.title || '').trim();
      if (title && title !== displayTitle) {
        return title;
      }
      return publicCoursesPath(
        publicCourseProgramKey(course.courseType, course.programCode)
      );
    },
    templateForType(
      this: SevaWorkspaceContext,
      courseType: string,
      programCode = ''
    ): string {
      return templateFromList(courseType, programCode, this.courseTemplates);
    },
    onCourseTypeChange(this: SevaWorkspaceContext): void {
      if (this.courseDraft.id) {
        return;
      }
      if (isIpCourseType(this.courseDraft.courseType)) {
        this.courseDraft.programCode = this.courseDraft.programCode || 'j';
      } else {
        this.courseDraft.programCode = '';
      }
      this.courseDraft.whatsappTemplate = this.templateForType(
        this.courseDraft.courseType,
        this.courseDraft.programCode
      );
    },
    onProgramCodeChange(this: SevaWorkspaceContext): void {
      if (this.courseDraft.id) {
        return;
      }
      this.courseDraft.whatsappTemplate = this.templateForType(
        this.courseDraft.courseType,
        this.courseDraft.programCode
      );
    },
    onPamphletSelected(this: SevaWorkspaceContext, event: Event): void {
      const input = event.target as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) {
        return;
      }
      this.courseEditorError = '';
      if (file.size >= MAX_PAMPHLET_BYTES) {
        this.coursePamphletError = PAMPHLET_SIZE_ERROR;
        this.coursePamphletFileName = '';
        input.value = '';
        return;
      }
      this.coursePamphletError = '';
      this.coursePamphletFileName = file.name;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        this.courseDraft.pamphletPreviewUrl = dataUrl;
        this.courseDraft.pamphletBase64 =
          comma >= 0 ? dataUrl.slice(comma + 1) : '';
        this.courseDraft.pamphletMimeType = file.type;
        this.courseDraft.hasPamphlet = true;
        this.courseDraft.clearPamphlet = false;
      };
      reader.onerror = () => {
        this.coursePamphletError =
          'Unable to read that pamphlet image. Please choose it again.';
        this.coursePamphletFileName = '';
        input.value = '';
      };
      reader.readAsDataURL(file);
    },
    clearCoursePamphlet(this: SevaWorkspaceContext): void {
      this.courseEditorError = '';
      this.coursePamphletError = '';
      this.coursePamphletFileName = '';
      this.courseDraft.hasPamphlet = false;
      this.courseDraft.clearPamphlet = true;
      this.courseDraft.pamphletBase64 = '';
      this.courseDraft.pamphletMimeType = '';
      this.courseDraft.pamphletPreviewUrl = '';
    },
    async switchWorkspaceView(
      this: SevaWorkspaceContext,
      view: 'callTracker' | 'courseManagement'
    ): Promise<void> {
      this.workspaceView = view;
      this.isFabOpen = false;
      if (view === 'courseManagement') {
        await this.loadCourses();
      }
    },
    async loadCourses(
      this: SevaWorkspaceContext,
      force = false
    ): Promise<void> {
      if (this.isLoadingCourses) {
        return;
      }
      if (this.courses.length && !force) {
        return;
      }
      this.isLoadingCourses = true;
      try {
        const response = await window.appRuntime.listCourses();
        this.courses = response.courses;
        this.courseTemplates = response.templates || [];
      } catch (error) {
        this.authError = toUserErrorMessage(
          error,
          'Unable to load courses right now.'
        );
      } finally {
        this.isLoadingCourses = false;
      }
    },
    openCourseEditor(this: SevaWorkspaceContext, course?: Course): void {
      this.courseEditorError = '';
      this.coursePamphletError = '';
      this.coursePamphletFileName = '';
      if (course) {
        this.courseDraft = courseToDraft(course);
      } else {
        const programs =
          this.appConfig.programs.length > 0
            ? this.appConfig.programs
            : this.defaultPrograms;
        const courseType = programs[0]?.code || 'HP';
        const programCode = isIpCourseType(courseType) ? 'j' : '';
        this.courseDraft = {
          ...createEmptyCourseDraft(courseType),
          programCode,
          whatsappTemplate: this.templateForType(courseType, programCode)
        };
      }
      this.isCourseEditorOpen = true;
    },
    closeCourseEditor(this: SevaWorkspaceContext): void {
      this.isCourseEditorOpen = false;
      this.isCourseSaving = false;
      this.courseEditorError = '';
      this.coursePamphletError = '';
      this.coursePamphletFileName = '';
      this.courseDraft = createEmptyCourseDraft();
    },
    previewCourse(this: SevaWorkspaceContext, course: Course): void {
      window.location.href = publicCoursesPath(
        publicCourseProgramKey(course.courseType, course.programCode)
      );
    },
    async saveCourse(this: SevaWorkspaceContext): Promise<void> {
      if (this.isCourseSaving) {
        return;
      }
      if (this.courseDraft.pamphletBase64.trim()) {
        const inspected = inspectPamphletUpload(
          this.courseDraft.pamphletBase64,
          this.courseDraft.pamphletMimeType
        );
        if (!inspected.ok) {
          this.courseEditorError = '';
          this.coursePamphletError = inspected.message;
          return;
        }
      }
      this.isCourseSaving = true;
      this.authError = '';
      this.courseEditorError = '';
      this.coursePamphletError = '';
      try {
        const payload = {
          courseType: this.courseDraft.courseType,
          programCode: normalizeProgramCode(
            this.courseDraft.courseType,
            this.courseDraft.programCode
          ),
          whatsappTemplate: this.courseDraft.whatsappTemplate,
          isActive: this.courseDraft.isActive,
          pamphletBase64: this.courseDraft.pamphletBase64,
          pamphletMimeType: this.courseDraft.pamphletMimeType,
          clearPamphlet: this.courseDraft.clearPamphlet
        };
        if (this.courseDraft.id) {
          const response = await window.appRuntime.updateCourse({
            ...payload,
            id: this.courseDraft.id
          });
          this.courses = this.courses.map((course) =>
            course.id === response.course.id ? response.course : course
          );
        } else {
          const response = await window.appRuntime.createCourse(payload);
          this.courses = [...this.courses, response.course];
        }
        this.actionMessage = 'Course saved.';
        this.closeCourseEditor();
      } catch (error) {
        const message = toUserErrorMessage(error, 'Unable to save the course.');
        if (message === PAMPHLET_SIZE_ERROR) {
          this.coursePamphletError = message;
        } else {
          this.courseEditorError = message;
        }
      } finally {
        this.isCourseSaving = false;
      }
    },
    async toggleCourseActive(
      this: SevaWorkspaceContext,
      course: Course
    ): Promise<void> {
      try {
        const response = await window.appRuntime.updateCourse({
          id: course.id,
          courseType: course.courseType,
          programCode: course.programCode || '',
          whatsappTemplate: course.whatsappTemplate,
          isActive: !course.isActive,
          pamphletBase64: '',
          pamphletMimeType: ''
        });
        this.courses = this.courses.map((item) =>
          item.id === response.course.id ? response.course : item
        );
      } catch (error) {
        this.authError = toUserErrorMessage(
          error,
          'Unable to update the course.'
        );
      }
    },
    async deleteCourse(
      this: SevaWorkspaceContext,
      course: Course
    ): Promise<void> {
      if (
        !window.confirm(
          'Delete ' +
            (course.title ||
              formatCourseTitle(course.courseType, course.programCode)) +
            '? This cannot be undone.'
        )
      ) {
        return;
      }
      try {
        await window.appRuntime.deleteCourse({ id: course.id });
        this.courses = this.courses.filter((item) => item.id !== course.id);
        this.actionMessage = 'Course deleted.';
      } catch (error) {
        this.authError = toUserErrorMessage(
          error,
          'Unable to delete the course.'
        );
      }
    },
    closeCoursePicker(this: SevaWorkspaceContext): void {
      this.isCoursePickerOpen = false;
      this.coursePickerLead = null;
    },
    async openWhatsappForLead(
      this: SevaWorkspaceContext,
      lead: Lead
    ): Promise<void> {
      if (!this.canOpenWhatsapp(lead)) {
        this.authError = 'Add a mobile number before opening WhatsApp.';
        return;
      }
      await this.loadCourses();
      const active = this.activeCourses();
      if (!active.length) {
        window.open(this.buildWhatsappHref(lead), '_blank', 'noopener');
        return;
      }
      const unique = findUniqueActiveCourse(lead.wishlistPrograms, active);
      if (unique) {
        window.open(this.buildWhatsappHref(lead, unique), '_blank', 'noopener');
        return;
      }
      this.coursePickerLead = lead;
      this.isCoursePickerOpen = true;
    },
    selectCourseForWhatsapp(this: SevaWorkspaceContext, course: Course): void {
      const lead = this.coursePickerLead;
      this.closeCoursePicker();
      if (!lead || !course.isActive) {
        return;
      }
      window.open(this.buildWhatsappHref(lead, course), '_blank', 'noopener');
    }
  };
}
