import { describe, expect, it } from 'vitest';
import { CreateCourseRequestSchema } from '../../shared/contracts/appContracts';
import {
  inspectPamphletUpload,
  MAX_PAMPHLET_BYTES
} from '../../shared/contracts/pamphlet';

const base64ForBytes = (size: number) => Buffer.alloc(size).toString('base64');

describe('pamphlet upload limits', () => {
  it('accepts images under 600 KB and rejects 600 KB', () => {
    expect(
      inspectPamphletUpload(
        base64ForBytes(MAX_PAMPHLET_BYTES - 1),
        'image/jpeg'
      )
    ).toEqual({ ok: true });
    expect(
      inspectPamphletUpload(base64ForBytes(MAX_PAMPHLET_BYTES), 'image/jpeg')
    ).toEqual({
      ok: false,
      message: 'Image must be < 600 kb'
    });
    expect(() =>
      CreateCourseRequestSchema.parse({
        activityType: 'Course',
        courseType: 'HP',
        pamphletBase64: base64ForBytes(MAX_PAMPHLET_BYTES),
        pamphletMimeType: 'image/jpeg'
      })
    ).toThrow('Image must be < 600 kb');
  });
});
