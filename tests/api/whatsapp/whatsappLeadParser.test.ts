import { describe, expect, it } from 'vitest';
import {
  parseLeadMessage,
  type LeadParserCatalog
} from '../../../api/_lib/whatsapp/leadParser.js';

const catalog: LeadParserCatalog = {
  courses: [
    { canonical: 'HP', aliases: ['Happiness Program'] },
    { canonical: 'DSN', aliases: [] },
    { canonical: 'YES+', aliases: ['YES Plus'] }
  ],
  leadQualities: [
    { canonical: 'Hot', aliases: [] },
    { canonical: 'Warm', aliases: [] },
    { canonical: 'Cold', aliases: [] }
  ],
  months: [
    { canonical: 'Aug', aliases: ['August'] },
    { canonical: 'Sep', aliases: ['September'] }
  ]
};

describe('parseLeadMessage', () => {
  it('extracts all fields from flexible ordering', () => {
    const parsed = parseLeadMessage(
      'Need intro 9876543210 Sandip HP Hot Aug',
      catalog
    );

    expect(parsed.mobile).toBe('9876543210');
    expect(parsed.name).toBe('Sandip');
    expect(parsed.course).toBe('HP');
    expect(parsed.leadQuality).toBe('Hot');
    expect(parsed.month).toBe('Aug');
    expect(parsed.notes).toBe('Need intro');
  });

  it('normalizes +91 and spaces in mobile', () => {
    const parsed = parseLeadMessage('Sandip +91 98765 43210 HP', catalog);

    expect(parsed.mobile).toBe('9876543210');
    expect(parsed.name).toBe('Sandip');
    expect(parsed.course).toBe('HP');
  });

  it('prefers name before mobile when both sides are valid', () => {
    const parsed = parseLeadMessage('Rajesh 9876543210 Kumar HP', catalog);

    expect(parsed.name).toBe('Rajesh');
    expect(parsed.notes).toBe('Kumar');
  });

  it.each([
    'Saurabh 9845702929 HP DSN Need More info',
    'Saurabh 9845702929 HP,DSN Need More info'
  ])('extracts multiple courses from %s', (message) => {
    const parsed = parseLeadMessage(message, catalog);

    expect(parsed.mobile).toBe('9845702929');
    expect(parsed.name).toBe('Saurabh');
    expect(parsed.course).toBe('HP,DSN');
    expect(parsed.notes).toBe('Need More info');
  });
});
