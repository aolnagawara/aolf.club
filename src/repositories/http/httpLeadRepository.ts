import type { LeadRepository } from '../contracts';
import {
  AssignMembersRequestSchema,
  AssignMembersResponseSchema,
  BootstrapResponseSchema,
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  DeleteLeadRequestSchema,
  DeleteLeadResponseSchema,
  UpdateLeadRequestSchema,
  UpdateLeadResponseSchema,
  type AssignMembersRequest,
  type AssignMembersResponse,
  type BootstrapResponse,
  type CreateLeadRequest,
  type CreateLeadResponse,
  type DeleteLeadRequest,
  type DeleteLeadResponse,
  type UpdateLeadRequest,
  type UpdateLeadResponse
} from '../../../shared/contracts/appContracts';
import { ApiClient } from '../../services/apiClient';

export class HttpLeadRepository implements LeadRepository {
  constructor(private readonly apiClient: ApiClient) {}

  async getBootstrap(campaignId?: string | null): Promise<BootstrapResponse> {
    const query = campaignId
      ? '?campaignId=' + encodeURIComponent(campaignId)
      : '';
    const response = await this.apiClient.get<unknown>(
      '/api/bootstrap' + query
    );
    return BootstrapResponseSchema.parse(response);
  }

  async assignMembers(
    payload: AssignMembersRequest
  ): Promise<AssignMembersResponse> {
    const parsed = AssignMembersRequestSchema.parse(payload);
    const response = await this.apiClient.post<unknown>(
      '/api/leads/assign',
      parsed
    );
    return AssignMembersResponseSchema.parse(response);
  }

  async updateLead(payload: UpdateLeadRequest): Promise<UpdateLeadResponse> {
    const parsed = UpdateLeadRequestSchema.parse(payload);
    const response = await this.apiClient.put<unknown>(
      '/api/leads/' + encodeURIComponent(parsed.id),
      parsed
    );
    return UpdateLeadResponseSchema.parse(response);
  }

  async createLead(payload: CreateLeadRequest): Promise<CreateLeadResponse> {
    const parsed = CreateLeadRequestSchema.parse(payload);
    const response = await this.apiClient.post<unknown>('/api/leads', parsed);
    return CreateLeadResponseSchema.parse(response);
  }

  async deleteLead(payload: DeleteLeadRequest): Promise<DeleteLeadResponse> {
    const parsed = DeleteLeadRequestSchema.parse(payload);
    const response = await this.apiClient.delete<unknown>(
      '/api/leads/' + encodeURIComponent(parsed.id),
      parsed
    );
    return DeleteLeadResponseSchema.parse(response);
  }
}
