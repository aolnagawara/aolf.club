import {
  CreateLeadRequestSchema,
  DeleteLeadRequestSchema,
  UpdateLeadRequestSchema,
  type BootstrapResponse,
  type CreateLeadResponse,
  type DeleteLeadResponse,
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
  }
};

export function getApiDataStore(): ApiDataStore {
  const env = getServerEnv();
  return env.APP_DATA_MODE === 'sheets' ? getSheetsStore() : mockStore;
}
