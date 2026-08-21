import type { Course } from '../../../shared/contracts/appContracts.js';
import {
  DEFAULT_HP_WHATSAPP_TEMPLATE,
  DEFAULT_COURSE_WHATSAPP_TEMPLATE,
  formatCourseTitle,
  publicCoursePath
} from '../../../shared/contracts/courseDefaults.mjs';

export const mockCourses: Course[] = [
  {
    id: 'crsHpNcr01AbcDefGhiJK',
    courseType: 'HP',
    programCode: '',
    title: formatCourseTitle('HP', ''),
    whatsappTemplate: DEFAULT_HP_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    publicPath: publicCoursePath('HP', ''),
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsDsnNcr01AbcDefGhiJK',
    courseType: 'DSN',
    programCode: '',
    title: formatCourseTitle('DSN', ''),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: false,
    hasPamphlet: false,
    pamphletImageUrl: '',
    publicPath: publicCoursePath('DSN', ''),
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsVtpNcr01AbcDefGhiJK',
    courseType: 'VTP',
    programCode: '',
    title: formatCourseTitle('VTP', ''),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    publicPath: publicCoursePath('VTP', ''),
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  }
];
