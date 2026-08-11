import { describe, expect, it } from 'vitest';
import { getBootstrapForUser } from '../../../api/_lib/storage/mockStore.js';

describe('mock store campaign selection', () => {
  it('rejects an unknown requested campaign like the Sheets store', async () => {
    await expect(
      getBootstrapForUser(
        { id: 'user-1', email: 'volunteer@example.com' },
        'missingCampaign00000x'
      )
    ).rejects.toThrow('CAMPAIGN_NOT_FOUND');
  });
});
