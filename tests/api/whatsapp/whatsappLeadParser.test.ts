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
    { canonical: 'Sep', aliases: ['September', 'Sept'] }
  ]
};

describe('parseLeadMessage', () => {
  it('treats text before the mobile on the same line as the name', () => {
    const parsed = parseLeadMessage(
      'Need intro 9876543210 Sandip HP Hot Aug',
      catalog
    );

    expect(parsed.mobile).toBe('9876543210');
    expect(parsed.name).toBe('Need intro');
    expect(parsed.course).toBe('HP');
    expect(parsed.leadQuality).toBe('Hot');
    expect(parsed.month).toBe('Aug');
    expect(parsed.notes).toBe('Sandip');
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
    ['Apoorva +919449713514 HP', 'Apoorva'],
    ['Apoorva Shetty +919449713514 HP', 'Apoorva Shetty'],
    ['Rajath: 96391 46920, HP', 'Rajath'],
    ['Murgeshan- 99625 74446 HP from Chennai', 'Murgeshan']
  ])('extracts and cleans the name in %s', (message, name) => {
    const parsed = parseLeadMessage(message, catalog);

    expect(parsed.name).toBe(name);
    expect(parsed.course).toBe('HP');
  });

  it('uses text between a leading mobile and the first tag as the name', () => {
    const parsed = parseLeadMessage(
      '9123456789 Apoorva Shetty HP Hot Please call',
      catalog
    );

    expect(parsed.name).toBe('Apoorva Shetty');
    expect(parsed.course).toBe('HP');
    expect(parsed.leadQuality).toBe('Hot');
    expect(parsed.notes).toBe('Please call');
  });

  it('keeps surrounding lines as notes while using the mobile line for the name', () => {
    const parsed = parseLeadMessage(
      'Interested to connect for future programs\nYash : 82172 99639\nInterested for IP',
      {
        ...catalog,
        courses: [...catalog.courses, { canonical: 'IP', aliases: [] }]
      }
    );

    expect(parsed.name).toBe('Yash');
    expect(parsed.mobile).toBe('8217299639');
    expect(parsed.course).toBe('IP');
    expect(parsed.notes).toBe(
      'Interested to connect for future programs Interested for'
    );
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

  it('treats Sept as the Sep month', () => {
    const parsed = parseLeadMessage(
      'Priya 9123456789 HP Warm Sept Call tomorrow',
      catalog
    );

    expect(parsed.month).toBe('Sep');
    expect(parsed.notes).toBe('Call tomorrow');
  });
});
