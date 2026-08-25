import { describe, expect, it } from 'vitest';
import { CreateCourseRequestSchema } from '../../shared/contracts/appContracts';
import {
  inspectImageUpload,
  MAX_IMAGE_BYTES
} from '../../shared/contracts/activityImage';

const base64ForBytes = (size: number) => Buffer.alloc(size).toString('base64');

describe('image upload limits', () => {
  it('accepts images under 3 MB and rejects 3 MB', () => {
    expect(
      inspectImageUpload(base64ForBytes(MAX_IMAGE_BYTES - 1), 'image/jpeg')
    ).toEqual({ ok: true });
    expect(
      inspectImageUpload(base64ForBytes(MAX_IMAGE_BYTES), 'image/jpeg')
    ).toEqual({
      ok: false,
      message: 'Image must be < 3 MB'
    });
    expect(() =>
      CreateCourseRequestSchema.parse({
        activityType: 'Course',
        courseType: 'HP',
        imageBase64: base64ForBytes(MAX_IMAGE_BYTES),
        imageMimeType: 'image/jpeg'
      })
    ).toThrow('Image must be < 3 MB');
  });
});
