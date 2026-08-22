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
    programCode: '',
    title: formatCourseTitle('HP', ''),
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
    id: 'crsDsnNc01AbcDefGhiJK',
    courseType: 'DSN',
    programCode: '',
    title: formatCourseTitle('DSN', ''),
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
    id: 'crsIpJnr01AbcDefGhiJK',
    courseType: 'IP',
    programCode: 'j',
    title: formatCourseTitle('IP', 'j'),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsIpSnr01AbcDefGhiJK',
    courseType: 'IP',
    programCode: 's',
    title: formatCourseTitle('IP', 's'),
    whatsappTemplate: DEFAULT_COURSE_WHATSAPP_TEMPLATE,
    isActive: true,
    hasPamphlet: false,
    pamphletImageUrl: '',
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    createdBy: 'volunteer@example.com',
    updatedBy: 'volunteer@example.com'
  },
  {
    id: 'crsVtpNc01AbcDefGhiJK',
    courseType: 'VTP',
    programCode: '',
    title: formatCourseTitle('VTP', ''),
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
