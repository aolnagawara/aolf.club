import { z } from 'zod';

const NanoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{21}$/, 'Expected a Nano ID (21 chars).');

export const AuthenticatedUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().optional(),
  picture: z.string().optional()
});

export const CampaignSchema = z.object({
  id: NanoIdSchema,
  name: z.string().min(1),
  type: z.enum(['Leads', 'Members']),
  message: z.string().optional(),
  showDonePrograms: z.boolean().optional()
});

export const ProgramSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1)
});

export const CampaignUiMetaSchema = z.object({
  queueTitle: z.string().min(1),
  filterOptions: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1)
      })
    )
    .default([])
});

export const QualityMetaSchema = z.object({
  icon: z.string().min(1),
  className: z.string().min(1)
});

export const VolunteerSchema = z.object({
  email: z.email(),
  name: z.string().min(1)
});

export const AppConfigSchema = z.object({
  id: NanoIdSchema,
  campaigns: z.array(CampaignSchema).default([]),
  programs: z.array(ProgramSchema).default([]),
  programDisplayOrder: z.array(z.string()).default([]),
  showDonePrograms: z.boolean().optional(),
  uiByType: z.record(z.string(), CampaignUiMetaSchema).optional(),
  qualityMetaMap: z.record(z.string(), QualityMetaSchema).optional(),
  statusIconMap: z.record(z.string(), z.string()).optional(),
  defaultStatusIcon: z.string().optional(),
  defaultCampaignMessage: z.string().optional(),
  whatsappCountryCode: z.string().optional(),
  allowedUsers: z.array(z.email()).default([]),
  volunteers: z.array(VolunteerSchema).default([])
});

export const LeadSchema = z.object({
  id: z.string().min(1),
  mobile: z.string().default(''),
  name: z.string().default(''),
  quality: z.string().default('Quality'),
  followUp: z.string().default('Follow-up'),
  lastUpdated: z.string().default('Just now'),
  status: z.string().default('Response'),
  notes: z.string().default(''),
  campaignId: z.string().optional(),
  campaignType: z.enum(['Leads', 'Members']).optional(),
  assignedVolunteerEmail: z.string().default(''),
  wishlistPrograms: z.string().default(''),
  donePrograms: z.string().default('')
});

export const BootstrapResponseSchema = z.object({
  success: z.literal(true),
  user: AuthenticatedUserSchema,
  campaignId: NanoIdSchema,
  config: AppConfigSchema,
  leads: z.array(LeadSchema)
});

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum([
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'UPSTREAM_ERROR',
      'INTERNAL_ERROR'
    ]),
    message: z.string(),
    details: z.unknown().optional()
  })
});

export const UpdateLeadRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  status: z.string().optional(),
  quality: z.string().optional(),
  followUp: z.string().optional(),
  notes: z.string().optional(),
  campaignId: NanoIdSchema,
  campaignType: z.enum(['Leads', 'Members']),
  assignedVolunteerEmail: z.email().optional(),
  wishlistPrograms: z.string().optional(),
  donePrograms: z.string().optional()
});

export const UpdateLeadResponseSchema = z.object({
  success: z.literal(true),
  lead: z.object({
    id: z.string().min(1),
    lastUpdated: z.string().min(1)
  })
});

export const CreateLeadRequestSchema = z.object({
  name: z.string().trim().min(1),
  mobile: z.string().trim().min(1),
  notes: z.string().optional(),
  campaignId: NanoIdSchema,
  campaignType: z.enum(['Leads', 'Members'])
});

export const CreateLeadResponseSchema = z.object({
  success: z.literal(true),
  lead: LeadSchema
});

export const DeleteLeadRequestSchema = z.object({
  id: z.string().min(1),
  campaignType: z.enum(['Leads', 'Members'])
});

export const DeleteLeadResponseSchema = z.object({
  success: z.literal(true),
  lead: z.object({ id: z.string().min(1) })
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type UpdateLeadRequest = z.infer<typeof UpdateLeadRequestSchema>;
export type UpdateLeadResponse = z.infer<typeof UpdateLeadResponseSchema>;
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;
export type DeleteLeadRequest = z.infer<typeof DeleteLeadRequestSchema>;
export type DeleteLeadResponse = z.infer<typeof DeleteLeadResponseSchema>;
