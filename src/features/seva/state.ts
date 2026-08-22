import type { SevaWorkspaceState } from './types';
import {
  createDefaultAppConfig,
  DEFAULT_QUALITY_META,
  DEFAULT_QUALITY_META_MAP,
  DEFAULT_STATUS_ICON,
  DEFAULT_STATUS_ICON_MAP,
  getDefaultPrograms
} from '../../config/campaignDefaults';
import { templateForCourseType } from '../../../shared/contracts/courseDefaults.mjs';

export function createEmptyCourseDraft(courseType = 'HP') {
  return {
    id: '',
    courseType,
    programCode: '',
    whatsappTemplate: templateForCourseType(courseType),
    isActive: true,
    hasPamphlet: false,
    clearPamphlet: false,
    pamphletBase64: '',
    pamphletMimeType: '',
    pamphletPreviewUrl: ''
  };
}

export function createSevaWorkspaceInitialState(): SevaWorkspaceState {
  return {
    campaigns: [],
    selectedCampaignId: '',
    selectedCampaign: null,
    campaignType: 'Leads',
    campaignMessage: '',
    leads: [],
    selectedFilter: 'all',
    metricFilter: 'all',
    searchQuery: '',
    volunteerEmail: '',
    authenticatedUser: null,
    authError: '',
    actionMessage: '',
    isVolunteerModalOpen: true,
    filterOptions: [{ id: 'all', label: 'All' }],
    isFilterPanelOpen: false,
    isProfileMenuOpen: false,
    isOptionSheetOpen: false,
    optionSheetMode: '',
    optionSheetTitle: '',
    optionSheetOptions: [],
    currentOptionValue: '',
    activeOptionLead: null,
    isFollowUpModalOpen: false,
    activeFollowUpLead: null,
    followUpDraft: '',
    isProgramEditorOpen: false,
    activeProgramLead: null,
    activeCardId: '',
    selectedIds: new Set<string>(),
    cardLongPressTimer: null,
    cardLongPressStart: null,
    suppressCardClickLeadId: '',
    isBulkActionPending: false,
    isFabOpen: false,
    isCreateRecordModalOpen: false,
    createRecordType: 'Leads',
    createRecordDraft: {
      name: '',
      mobile: '',
      notes: '',
      campaignId: ''
    },
    isCreateRecordSaving: false,
    globalPointerDownHandler: null,
    programDraft: {
      wishlist: [],
      done: []
    },
    filteredCriteriaKey: '',
    programFilter: '',
    pageSize: 25,
    visibleLeadLimit: 25,
    dueFollowUpCount: 0,
    upcomingFollowUpCount: 0,
    qualityOptions: [],
    statusOptions: [],
    isLoadingBootstrap: false,
    isCampaignSwitching: false,
    isCampaignRefreshing: false,
    isAssignMembersModalOpen: false,
    assignMembersDraft: {
      count: 10,
      engagementLevel: ''
    },
    isAssigningMembers: false,
    qualityMetaMap: { ...DEFAULT_QUALITY_META_MAP },
    defaultQualityMeta: { ...DEFAULT_QUALITY_META },
    statusIconMap: { ...DEFAULT_STATUS_ICON_MAP },
    defaultStatusIcon: DEFAULT_STATUS_ICON,
    programOrderMap: {},
    programCodeMap: {},
    appConfig: createDefaultAppConfig(),
    defaultPrograms: getDefaultPrograms(),
    workspaceView: 'callTracker',
    courses: [],
    courseTemplates: [],
    isLoadingCourses: false,
    isCourseEditorOpen: false,
    isCourseSaving: false,
    courseEditorError: '',
    coursePamphletError: '',
    coursePamphletFileName: '',
    courseDraft: createEmptyCourseDraft(),
    isCoursePickerOpen: false,
    coursePickerLead: null
  };
}
