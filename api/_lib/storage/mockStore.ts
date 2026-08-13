import {
  BootstrapResponseSchema,
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  DeleteLeadRequestSchema,
  DeleteLeadResponseSchema,
  UpdateLeadRequestSchema,
  UpdateLeadResponseSchema,
  type AuthenticatedUser,
  type CreateLeadRequest,
  type DeleteLeadRequest,
  type Lead,
  type UpdateLeadRequest
} from '../../../shared/contracts/appContracts.js';
import { nanoid } from 'nanoid';
import { mockBootstrapData } from '../../../src/repositories/mock/mockData.js';
import { normalizeEmail } from '../http/normalization.js';

type StoreState = {
  leads: Lead[];
};

const globalStore = globalThis as unknown as { __aolfStore?: StoreState };

function getStore(): StoreState {
  if (!globalStore.__aolfStore) {
    globalStore.__aolfStore = {
      leads: structuredClone(mockBootstrapData.leads)
    };
  }
  return globalStore.__aolfStore;
}

function isAssignedToUser(lead: Lead, email: string): boolean {
  return (
    normalizeEmail(String(lead.assignedVolunteerEmail || '')) ===
    normalizeEmail(email)
  );
}

export function isUserAllowed(email: string) {
  const allowedUsers = mockBootstrapData.config.allowedUsers || [];
  if (!allowedUsers.length) {
    return true;
  }

  const requestedEmail = normalizeEmail(email);
  return allowedUsers
    .map((item: string) => normalizeEmail(item))
    .includes(requestedEmail);
}

export async function getBootstrapForUser(
  user: AuthenticatedUser,
  campaignId?: string | null
) {
  const store = getStore();
  const selectedCampaignId = campaignId || mockBootstrapData.campaignId;
  const selectedCampaign = mockBootstrapData.config.campaigns.find(
    (campaign: { id: string }) => campaign.id === selectedCampaignId
  );
  if (!selectedCampaign) {
    throw new Error('CAMPAIGN_NOT_FOUND');
  }

  const payload = {
    ...mockBootstrapData,
    user,
    campaignId: selectedCampaign.id,
    leads: store.leads.filter(
      (lead) =>
        isAssignedToUser(lead, String(user.email || '')) &&
        lead.campaignId === selectedCampaign.id &&
        lead.campaignType === selectedCampaign.type
    )
  };

  return BootstrapResponseSchema.parse(payload);
}

export async function updateLeadForUser(
  user: AuthenticatedUser,
  payload: UpdateLeadRequest
) {
  const store = getStore();
  const parsed = UpdateLeadRequestSchema.parse(payload);
  const targetVolunteerEmail = parsed.assignedVolunteerEmail
    ? normalizeEmail(parsed.assignedVolunteerEmail)
    : undefined;
  if (targetVolunteerEmail && !isUserAllowed(targetVolunteerEmail)) {
    throw new Error('VOLUNTEER_NOT_ALLOWED');
  }
  const index = store.leads.findIndex(
    (lead) => lead.id === parsed.id && lead.campaignType === parsed.campaignType
  );

  if (index < 0) {
    throw new Error('Lead not found.');
  }

  if (!isAssignedToUser(store.leads[index], String(user.email || ''))) {
    throw new Error('FORBIDDEN_LEAD_ASSIGNMENT');
  }

  store.leads[index] = {
    ...store.leads[index],
    ...parsed,
    assignedVolunteerEmail:
      targetVolunteerEmail || store.leads[index].assignedVolunteerEmail,
    lastUpdated: 'Just now'
  };

  return UpdateLeadResponseSchema.parse({
    success: true,
    lead: {
      id: parsed.id,
      lastUpdated: 'Just now'
    }
  });
}

export async function createLeadForUser(
  user: AuthenticatedUser,
  payload: CreateLeadRequest
) {
  const store = getStore();
  const parsed = CreateLeadRequestSchema.parse(payload);
  const campaign = mockBootstrapData.config.campaigns.find(
    (item) => item.id === parsed.campaignId
  );
  if (!campaign) {
    throw new Error('CAMPAIGN_NOT_FOUND');
  }
  if (campaign.type !== parsed.campaignType) {
    throw new Error('CAMPAIGN_TYPE_MISMATCH');
  }

  const lead: Lead = {
    id: nanoid(),
    mobile: parsed.mobile,
    name: parsed.name,
    quality: parsed.campaignType === 'Members' ? 'Engagement' : 'Quality',
    followUp: 'Follow-up',
    lastUpdated: new Date().toISOString(),
    status: 'Response',
    notes: parsed.notes || '',
    campaignId: parsed.campaignId,
    campaignType: parsed.campaignType,
    assignedVolunteerEmail: normalizeEmail(user.email),
    wishlistPrograms: '',
    donePrograms: ''
  };
  store.leads.push(lead);
  return CreateLeadResponseSchema.parse({ success: true, lead });
}

export async function deleteLeadForUser(
  user: AuthenticatedUser,
  payload: DeleteLeadRequest
) {
  const store = getStore();
  const parsed = DeleteLeadRequestSchema.parse(payload);
  const index = store.leads.findIndex(
    (lead) => lead.id === parsed.id && lead.campaignType === parsed.campaignType
  );
  if (index < 0) {
    throw new Error('Lead not found.');
  }
  if (!isAssignedToUser(store.leads[index], String(user.email || ''))) {
    throw new Error('FORBIDDEN_LEAD_ASSIGNMENT');
  }
  store.leads.splice(index, 1);
  return DeleteLeadResponseSchema.parse({
    success: true,
    lead: { id: parsed.id }
  });
}
