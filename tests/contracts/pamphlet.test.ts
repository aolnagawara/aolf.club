import { describe, expect, it } from 'vitest';
import { CreateCourseRequestSchema } from '../../shared/contracts/appContracts';
import {
  inspectPamphletUpload,
  MAX_PAMPHLET_BYTES
} from '../../shared/contracts/pamphlet';

const base64ForBytes = (size: number) => Buffer.alloc(size).toString('base64');

describe('pamphlet upload limits', () => {
  it('accepts 600 KB and rejects the next byte', () => {
    expect(
      inspectPamphletUpload(base64ForBytes(MAX_PAMPHLET_BYTES), 'image/jpeg')
    ).toEqual({ ok: true });
    expect(
      inspectPamphletUpload(
        base64ForBytes(MAX_PAMPHLET_BYTES + 1),
        'image/jpeg'
      )
    ).toEqual({
      ok: false,
      message: 'Pamphlet must be 600 KB or smaller.'
    });
    expect(() =>
      CreateCourseRequestSchema.parse({
        courseType: 'HP',
        pamphletBase64: base64ForBytes(MAX_PAMPHLET_BYTES + 1),
        pamphletMimeType: 'image/jpeg'
      })
    ).toThrow('Pamphlet must be 600 KB or smaller.');
  });
});
