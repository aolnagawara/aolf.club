import {
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
  getShortUrlDestination: (
    slug: string,
    operation?: SheetsOperation
  ) => Promise<string | null>;
  listPublicHomepageOffers: (
    operation?: SheetsOperation
  ) => Promise<PublicHomepageOffersResponse>;
};

let sheetsStore: ApiDataStore | null = null;
let mockStorePromise: Promise<ApiDataStore> | null = null;

function getSheetsStore(): ApiDataStore {
  if (!sheetsStore) {
    sheetsStore = createSheetsStore();
  }

  return sheetsStore;
}

async function getMockStore(): Promise<ApiDataStore> {
  if (!mockStorePromise) {
    mockStorePromise = import('./mockDataStore.js').then(
      ({ mockDataStore }) => mockDataStore
    );
  }

  return mockStorePromise;
}

export async function getApiDataStore(): Promise<ApiDataStore> {
  const env = getServerEnv();
  return env.APP_DATA_MODE === 'sheets' ? getSheetsStore() : getMockStore();
}
