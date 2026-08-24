import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  CreateLeadRequestSchema,
  LeadSchema,
  UpdateLeadRequestSchema
} from '../../shared/contracts/appContracts';

describe('ApiErrorSchema', () => {
  it('requires retryability and a trace id for structured failures', () => {
    expect(
      ApiErrorSchema.parse({
        success: false,
        error: {
          code: 'UPSTREAM_TIMEOUT',
          message: 'Unable to access data right now. Please try again.',
          retryable: true,
          traceId: 'trace-123'
        }
      })
    ).toMatchObject({
      error: { code: 'UPSTREAM_TIMEOUT', retryable: true }
    });
  });
});

describe('LeadSchema', () => {
  it('applies defaults for optional lead fields', () => {
    const parsed = LeadSchema.parse({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Test User'
    });

    expect(parsed.status).toBe('Response');
    expect(parsed.mobile).toBe('');
    expect(parsed.followUp).toBe('Follow-up');
    expect(parsed.notes).toBe('');
  });

  it('keeps record identity separate from the contact mobile number', () => {
    const parsed = LeadSchema.parse({
      id: 'leadAarv01AbcDefGhIJK',
      mobile: '+91 98765 43210',
      name: 'Aarav'
    });

    expect(parsed.id).toBe('leadAarv01AbcDefGhIJK');
    expect(parsed.mobile).toBe('+91 98765 43210');
  });
});

describe('UpdateLeadRequestSchema', () => {
  it('requires id and campaign context', () => {
    expect(() =>
      UpdateLeadRequestSchema.parse({
        id: '55555555-5555-4555-8555-555555555555',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType: 'Leads'
      })
    ).not.toThrow();

    expect(() =>
      UpdateLeadRequestSchema.parse({
        id: '',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType: 'Leads'
      })
    ).toThrow();
  });
});

describe('CreateLeadRequestSchema', () => {
  it('stores a normalized 10-digit Indian mobile', () => {
    expect(
      CreateLeadRequestSchema.parse({
        name: 'Aarav',
        mobile: '+91 98765 43210',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType: 'Leads'
      }).mobile
    ).toBe('9876543210');
  });

  it('rejects a mobile that is not a valid Indian number', () => {
    expect(() =>
      CreateLeadRequestSchema.parse({
        name: 'Aarav',
        mobile: '12345',
        campaignId: 'cmpLeads01AbcDefGhIJk',
        campaignType: 'Leads'
      })
    ).toThrow('Enter a valid 10-digit Indian mobile number.');
  });
});

describe('CourseWriteFieldsSchema', () => {
  it('requires course type and rejects invalid pamphlets', async () => {
    const { CourseWriteFieldsSchema } =
      await import('../../shared/contracts/appContracts');
    expect(
      CourseWriteFieldsSchema.parse({
        activityType: 'Course',
        courseType: 'HP'
      }).isActive
    ).toBe(true);
    expect(
      CourseWriteFieldsSchema.parse({
        activityType: 'Course',
        courseType: 'IP',
        programCode: 'j'
      }).programCode
    ).toBe('j');
    expect(() =>
      CourseWriteFieldsSchema.parse({
        activityType: 'Course',
        courseType: 'IP'
      })
    ).toThrow();
    expect(
      CourseWriteFieldsSchema.parse({
        activityType: 'Event',
        title: 'Weekly Follow-up'
      }).title
    ).toBe('Weekly Follow-up');
    expect(() =>
      CourseWriteFieldsSchema.parse({
        activityType: 'Course',
        courseType: 'HP',
        pamphletBase64: 'abc',
        pamphletMimeType: 'image/svg+xml'
      })
    ).toThrow();
  });
});
