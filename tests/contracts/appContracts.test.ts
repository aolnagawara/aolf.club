import { describe, expect, it } from 'vitest';
import {
  LeadSchema,
  UpdateLeadRequestSchema
} from '../../shared/contracts/appContracts';

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
