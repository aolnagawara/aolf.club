import type { Course } from '../../../shared/contracts/appContracts.js';
import {
  DEFAULT_HP_WHATSAPP_TEMPLATE,
  DEFAULT_COURSE_WHATSAPP_TEMPLATE,
  formatCourseTitle
} from '../../../shared/contracts/courseDefaults.mjs';

export const mockCourses: Course[] = [
  {
    id: 'crsHpNcr01AbcDefGhiJK',
    courseType: 'HP',
    month: '2026-08',
    title: formatCourseTitle('HP', '2026-08'),
    whatsappTemplate: DEFAULT_HP_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsDsnNcr01AbcDefGhiJK',
    courseType: 'DSN',
    month: '2026-09',
    title: formatCourseTitle('DSN', '2026-09'),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: false,
    hasPamphlet: false,
    pamphletImageUrl: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsVtpNcr01AbcDefGhiJK',
    courseType: 'VTP',
    month: '2026-09',
    title: formatCourseTitle('VTP', '2026-09'),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  }
];
