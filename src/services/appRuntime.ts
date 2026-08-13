import { authService } from './authService';
import { leadService } from './leadService';
import type {
  CreateLeadRequest,
  DeleteLeadRequest,
  UpdateLeadRequest
} from '../../shared/contracts/appContracts';

export const appRuntime = {
  async getAuthenticatedUser() {
    return authService.getSessionUser();
  },
  async signInWithGoogle() {
    return authService.signIn();
  },
  async signOut() {
    return authService.signOut();
  },
  async loadBootstrap(campaignId?: string | null) {
    return leadService.getBootstrap(campaignId);
  },
  async createLead(payload: CreateLeadRequest) {
    return leadService.createLead(payload);
  },
  async updateLead(payload: UpdateLeadRequest) {
    return leadService.updateLead(payload);
  },
  async deleteLead(payload: DeleteLeadRequest) {
    return leadService.deleteLead(payload);
  }
};
