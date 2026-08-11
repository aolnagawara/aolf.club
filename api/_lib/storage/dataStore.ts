import {
  CreateLeadRequestSchema,
  DeleteLeadRequestSchema,
  UpdateLeadRequestSchema,
  type BootstrapResponse,
  type CreateLeadRequest,
  type CreateLeadResponse,
  type DeleteLeadRequest,
  type DeleteLeadResponse,
  type UpdateLeadRequest,
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
import {
  createLeadForUser as createMockLeadForUser,
  deleteLeadForUser as deleteMockLeadForUser,
  getBootstrapForUser as getMockBootstrapForUser,
  isUserAllowed as isMockUserAllowed,
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
  getBootstrapForUser: (
    user: SessionUser,
    campaignId?: string | null,
    operation?: SheetsOperation
  ) => Promise<BootstrapResponse>;
  getBootstrapForAuthorizedUser: (
    user: SessionUser,
    campaignId?: string | null,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<BootstrapResponse>>;
  createLeadForUser: (
    user: SessionUser,
    payload: CreateLeadRequest,
    operation?: SheetsOperation
  ) => Promise<CreateLeadResponse>;
  createLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<CreateLeadResponse>>;
  updateLeadForUser: (
    user: SessionUser,
    payload: UpdateLeadRequest,
    operation?: SheetsOperation
  ) => Promise<UpdateLeadResponse>;
  updateLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<UpdateLeadResponse>>;
  deleteLeadForUser: (
    user: SessionUser,
    payload: DeleteLeadRequest,
    operation?: SheetsOperation
  ) => Promise<DeleteLeadResponse>;
  deleteLeadForAuthorizedUser: (
    user: SessionUser,
    payload: unknown,
    operation?: SheetsOperation
  ) => Promise<AuthorizedStoreResult<DeleteLeadResponse>>;
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

  async getBootstrapForUser(user, campaignId) {
    return getMockBootstrapForUser(user, campaignId);
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

  async createLeadForUser(user, payload) {
    return createMockLeadForUser(user, payload);
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

  async updateLeadForUser(user, payload) {
    return updateMockLeadForUser(user, payload);
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

  async deleteLeadForUser(user, payload) {
    return deleteMockLeadForUser(user, payload);
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
  }
};

export function getApiDataStore(): ApiDataStore {
  const env = getServerEnv();
  return env.APP_DATA_MODE === 'sheets' ? getSheetsStore() : mockStore;
}
