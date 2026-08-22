import { env } from '../config/env';
import type { LeadRepository } from '../repositories/contracts';
import { MockLeadRepository } from '../repositories/mock/mockLeadRepository';
import { HttpLeadRepository } from '../repositories/http/httpLeadRepository';
import { ApiClient } from './apiClient';
import type {
  AssignMembersRequest,
  CreateLeadRequest,
  DeleteLeadRequest,
  UpdateLeadRequest
} from '../../shared/contracts/appContracts';

function createRepository(): LeadRepository {
  if (env.VITE_APP_MODE === 'api') {
    return new HttpLeadRepository(new ApiClient(env.VITE_API_BASE_URL || ''));
  }
  return new MockLeadRepository();
}

const leadRepository = createRepository();

export const leadService = {
  getBootstrap(campaignId?: string | null) {
    return leadRepository.getBootstrap(campaignId);
  },
  assignMembers(payload: AssignMembersRequest) {
    return leadRepository.assignMembers(payload);
  },
  createLead(payload: CreateLeadRequest) {
    return leadRepository.createLead(payload);
  },
  updateLead(payload: UpdateLeadRequest) {
    return leadRepository.updateLead(payload);
  },
  deleteLead(payload: DeleteLeadRequest) {
    return leadRepository.deleteLead(payload);
  }
};
