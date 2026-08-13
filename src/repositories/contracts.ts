import type {
  AuthenticatedUser,
  BootstrapResponse,
  CreateLeadRequest,
  CreateLeadResponse,
  DeleteLeadRequest,
  DeleteLeadResponse,
  UpdateLeadRequest,
  UpdateLeadResponse
} from '../../shared/contracts/appContracts';

export interface AuthProvider {
  getSessionUser(): Promise<AuthenticatedUser | null>;
  signIn(): Promise<AuthenticatedUser>;
  signOut(): Promise<void>;
}

export interface LeadRepository {
  getBootstrap(campaignId?: string | null): Promise<BootstrapResponse>;
  createLead(payload: CreateLeadRequest): Promise<CreateLeadResponse>;
  updateLead(payload: UpdateLeadRequest): Promise<UpdateLeadResponse>;
  deleteLead(payload: DeleteLeadRequest): Promise<DeleteLeadResponse>;
}
