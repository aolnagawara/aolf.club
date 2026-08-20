import type { SevaWorkspaceContext, CourseDraft, Lead } from '../seva/types';
import type {
  Course,
  CourseTemplate
} from '../../../shared/contracts/appContracts';
import { toUserErrorMessage } from '../../services/apiClient';
import { createEmptyCourseDraft } from '../seva/state';
import { findUniqueActiveCourse } from '../../../shared/contracts/courseMatching';
import {
  formatCourseMonthLabel,
  formatCourseTitle,
  publicCoursePath,
  templateForCourseType
} from '../../../shared/contracts/courseDefaults.mjs';
import { MAX_PAMPHLET_BYTES } from '../../../shared/contracts/pamphlet';

function templateFromList(
  courseType: string,
  templates: readonly CourseTemplate[]
): string {
  const match = templates.find(
    (item) =>
      item.courseType.trim().toUpperCase() ===
      courseType.trim().toUpperCase()
  );
  return match?.template || templateForCourseType(courseType);
}

function courseToDraft(course: Course): CourseDraft {
  return {
    id: course.id,
    courseType: course.courseType || '',
    month: course.month || '',
    whatsappTemplate: course.whatsappTemplate || '',
    isActive: course.isActive,
    hasPamphlet: Boolean(course.hasPamphlet),
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
    courseDisplayTitle(this: SevaWorkspaceContext, course: Course): string {
      const programs =
        this.appConfig.programs.length > 0
          ? this.appConfig.programs
          : this.defaultPrograms;
      const label =
        programs.find((item) => item.code === course.courseType)?.label ||
        course.courseType;
      return label + ' · ' + formatCourseMonthLabel(course.month);
    },
    formatCourseMonthLabel(this: SevaWorkspaceContext, month: string): string {
      return formatCourseMonthLabel(month);
    },
    templateForType(this: SevaWorkspaceContext, courseType: string): string {
      return templateFromList(courseType, this.courseTemplates);
    },
    onCourseTypeChange(this: SevaWorkspaceContext): void {
      if (this.courseDraft.id) {
        return;
      }
      this.courseDraft.whatsappTemplate = this.templateForType(
        this.courseDraft.courseType
      );
    },
    onPamphletSelected(
      this: SevaWorkspaceContext,
      event: Event
    ): void {
      const input = event.target as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) {
        return;
      }
      if (file.size > MAX_PAMPHLET_BYTES) {
        this.authError = 'Pamphlet must be 1.5 MB or smaller.';
        input.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        this.courseDraft.pamphletPreviewUrl = dataUrl;
        this.courseDraft.pamphletBase64 =
          comma >= 0 ? dataUrl.slice(comma + 1) : '';
        this.courseDraft.pamphletMimeType = file.type;
        this.courseDraft.hasPamphlet = true;
      };
      reader.readAsDataURL(file);
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
    async loadCourses(this: SevaWorkspaceContext, force = false): Promise<void> {
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
      if (course) {
        this.courseDraft = courseToDraft(course);
      } else {
        const programs =
          this.appConfig.programs.length > 0
            ? this.appConfig.programs
            : this.defaultPrograms;
        const courseType = programs[0]?.code || 'HP';
        this.courseDraft = {
          ...createEmptyCourseDraft(courseType),
          whatsappTemplate: this.templateForType(courseType)
        };
      }
      this.isCourseEditorOpen = true;
    },
    closeCourseEditor(this: SevaWorkspaceContext): void {
      this.isCourseEditorOpen = false;
      this.isCourseSaving = false;
      this.courseDraft = createEmptyCourseDraft();
    },
    previewCourse(this: SevaWorkspaceContext, course: Course): void {
      window.location.href =
        course.publicPath || publicCoursePath(course.courseType, course.month);
    },
    async saveCourse(this: SevaWorkspaceContext): Promise<void> {
      if (this.isCourseSaving) {
        return;
      }
      this.isCourseSaving = true;
      this.authError = '';
      try {
        const payload = {
          courseType: this.courseDraft.courseType,
          month: this.courseDraft.month,
          whatsappTemplate: this.courseDraft.whatsappTemplate,
          isActive: this.courseDraft.isActive,
          pamphletBase64: this.courseDraft.pamphletBase64,
          pamphletMimeType: this.courseDraft.pamphletMimeType
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
        this.authError = toUserErrorMessage(
          error,
          'Unable to save the course.'
        );
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
          month: course.month,
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
    async deleteCourse(this: SevaWorkspaceContext, course: Course): Promise<void> {
      if (
        !window.confirm(
          'Delete ' +
            (course.title || formatCourseTitle(course.courseType, course.month)) +
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
    selectCourseForWhatsapp(
      this: SevaWorkspaceContext,
      course: Course
    ): void {
      const lead = this.coursePickerLead;
      this.closeCoursePicker();
      if (!lead || !course.isActive) {
        return;
      }
      window.open(this.buildWhatsappHref(lead, course), '_blank', 'noopener');
    }
  };
}
