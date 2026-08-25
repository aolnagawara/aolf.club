import { env } from '../config/env';
import type { LeadRepository } from '../repositories/contracts';
import { HttpLeadRepository } from '../repositories/http/httpLeadRepository';
import { ApiClient } from './apiClient';
import type {
  AssignMembersRequest,
  CreateLeadRequest,
  DeleteLeadRequest,
  UpdateLeadRequest
} from '../../shared/contracts/appContracts';

const httpLeadRepository = new HttpLeadRepository(
  new ApiClient(env.VITE_API_BASE_URL || '')
);
let mockLeadRepositoryPromise: Promise<LeadRepository> | null = null;

async function getRepository(): Promise<LeadRepository> {
  if (env.VITE_APP_MODE === 'api') {
    return httpLeadRepository;
  }
  if (!mockLeadRepositoryPromise) {
    mockLeadRepositoryPromise = import(
      '../repositories/mock/mockLeadRepository'
    ).then(({ MockLeadRepository }) => new MockLeadRepository());
  }
  return mockLeadRepositoryPromise;
}

export const leadService = {
  async getBootstrap(campaignId?: string | null) {
    return (await getRepository()).getBootstrap(campaignId);
  },
  async assignMembers(payload: AssignMembersRequest) {
    return (await getRepository()).assignMembers(payload);
  },
  async createLead(payload: CreateLeadRequest) {
    return (await getRepository()).createLead(payload);
  },
  async updateLead(payload: UpdateLeadRequest) {
    return (await getRepository()).updateLead(payload);
  },
  async deleteLead(payload: DeleteLeadRequest) {
    return (await getRepository()).deleteLead(payload);
  }
};
