import {
  CreateCourseRequestSchema,
  CreateLeadRequestSchema,
  DeleteCourseRequestSchema,
  DeleteLeadRequestSchema,
  UpdateCourseRequestSchema,
  UpdateLeadRequestSchema,
  type BootstrapResponse,
  type Course,
  type CreateCourseResponse,
  type CreateLeadResponse,
  type DeleteCourseResponse,
  type DeleteLeadResponse,
  type ListCoursesResponse,
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
  createCourseForUser as createMockCourseForUser,
  createLeadForUser as createMockLeadForUser,
  deleteCourseForUser as deleteMockCourseForUser,
  deleteLeadForUser as deleteMockLeadForUser,
  getBootstrapForUser as getMockBootstrapForUser,
  getPublicCourseById as getMockPublicCourseById,
  getPublicCoursePamphlet as getMockPublicCoursePamphlet,
  isUserAllowed as isMockUserAllowed,
  listCoursesForUser as listMockCoursesForUser,
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
  getPublicCourseById: (
    id: string,
    operation?: SheetsOperation
  ) => Promise<Course | null>;
  getPublicCoursePamphlet: (
    id: string,
    operation?: SheetsOperation
  ) => Promise<PamphletBytes | null>;
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

  async getPublicCourseById(id) {
    return getMockPublicCourseById(id);
  },

  async getPublicCoursePamphlet(id) {
    return getMockPublicCoursePamphlet(id);
  }
};

export function getApiDataStore(): ApiDataStore {
  const env = getServerEnv();
  return env.APP_DATA_MODE === 'sheets' ? getSheetsStore() : mockStore;
}
