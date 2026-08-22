import {
  AssignMembersRequestSchema,
  CreateCourseRequestSchema,
  CreateLeadRequestSchema,
  DeleteCourseRequestSchema,
  DeleteLeadRequestSchema,
  UpdateCourseRequestSchema,
  UpdateLeadRequestSchema,
  type AssignMembersResponse,
  type BootstrapResponse,
  type Course,
  type CreateCourseResponse,
  type CreateLeadResponse,
  type DeleteCourseResponse,
  type DeleteLeadResponse,
  type ListCoursesResponse,
  type PublicHomepageOffersResponse,
  type UpdateCourseResponse,
  type UpdateLeadResponse
} from '../../../shared/contracts/appContracts.js';
import { getServerEnv } from '../config/env.js';
import {
  createSheetsStore,
  type AuthorizedStoreResult,
  type StoreAuthorizationResult
} from '../sheets/store.js';
import type { SheetsOperation } from '../sheets/client.js';
import type { SessionUser } from '../auth/session.js';
import type { PamphletBytes } from '../courses/pamphletStore.js';
import {
  assignMembersToUser as assignMockMembersToUser,
  createCourseForUser as createMockCourseForUser,
  createLeadForUser as createMockLeadForUser,
  deleteCourseForUser as deleteMockCourseForUser,
  deleteLeadForUser as deleteMockLeadForUser,
  getBootstrapForUser as getMockBootstrapForUser,
  getPublicCourses as getMockPublicCourses,
  getPublicCoursePamphlet as getMockPublicCoursePamphlet,
  isUserAllowed as isMockUserAllowed,
  listCoursesForUser as listMockCoursesForUser,
  listPublicHomepageOffers as listMockPublicHomepageOffers,
  updateCourseForUser as updateMockCourseForUser,
  updateLeadForUser as updateMockLeadForUser
} from './mockStore.js';

export type ApiDataStore = {
  authorizeUser: (
    user: SessionUser,
    operation?: SheetsOperation
  ) => Promise<StoreAuthorizationResult>;
  isUserAllowed: (
    user: SessionUser,
    operation?: SheetsOperation
  ) => Promise<boolean>;
  getBootstrapForAuthorizedUser: (
    user: SessionUser,
    campaignId?: string | null,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<BootstrapResponse>>;
  assignMembersForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<AssignMembersResponse>>;
  createLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<CreateLeadResponse>>;
  updateLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<UpdateLeadResponse>>;
  deleteLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<DeleteLeadResponse>>;
  listCoursesForAuthorizedUser: (
    user: SessionUser,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<ListCoursesResponse>>;
  createCourseForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<CreateCourseResponse>>;
  updateCourseForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<UpdateCourseResponse>>;
  deleteCourseForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<DeleteCourseResponse>>;
  getPublicCourses: (
    programKey?: string,
    operation?: SheetsOperation
  ) => Promise<{
    selected: Course | null;
    courses: Course[];
    selectionMatched: boolean;
  }>;
  getPublicCoursePamphlet: (
    id: string,
    operation?: SheetsOperation
  ) => Promise<PamphletBytes | null>;
  listPublicHomepageOffers: (
    operation?: SheetsOperation
  ) => Promise<PublicHomepageOffersResponse>;
};

let sheetsStore: ApiDataStore | null = null;

function getSheetsStore(): ApiDataStore {
  if (!sheetsStore) {
    sheetsStore = createSheetsStore();
  }

  return sheetsStore;
}

const mockStore: ApiDataStore = {
  async authorizeUser(user) {
    return { allowed: isMockUserAllowed(user.email) };
  },

  async isUserAllowed(user) {
    return isMockUserAllowed(user.email);
  },

  async getBootstrapForAuthorizedUser(user, campaignId) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await getMockBootstrapForUser(user, campaignId)
    };
  },

  async assignMembersForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await assignMockMembersToUser(
        user,
        AssignMembersRequestSchema.parse(payload)
      )
    };
  },

  async createLeadForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await createMockLeadForUser(
        user,
        CreateLeadRequestSchema.parse(payload)
      )
    };
  },

  async updateLeadForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await updateMockLeadForUser(
        user,
        UpdateLeadRequestSchema.parse(payload)
      )
    };
  },

  async deleteLeadForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await deleteMockLeadForUser(
        user,
        DeleteLeadRequestSchema.parse(payload)
      )
    };
  },

  async listCoursesForAuthorizedUser(user) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return { allowed: true, value: await listMockCoursesForUser() };
  },

  async createCourseForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await createMockCourseForUser(
        user,
        CreateCourseRequestSchema.parse(payload)
      )
    };
  },

  async updateCourseForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await updateMockCourseForUser(
        user,
        UpdateCourseRequestSchema.parse(payload)
      )
    };
  },

  async deleteCourseForAuthorizedUser(user, payload) {
    if (!isMockUserAllowed(user.email)) {
      return { allowed: false };
    }
    return {
      allowed: true,
      value: await deleteMockCourseForUser(
        DeleteCourseRequestSchema.parse(payload)
      )
    };
  },

  async getPublicCourses(programKey) {
    return getMockPublicCourses(programKey);
  },

  async getPublicCoursePamphlet(id) {
    return getMockPublicCoursePamphlet(id);
  },

  async listPublicHomepageOffers() {
    return listMockPublicHomepageOffers();
  }
};

export function getApiDataStore(): ApiDataStore {
  const env = getServerEnv();
  return env.APP_DATA_MODE === 'sheets' ? getSheetsStore() : mockStore;
}
