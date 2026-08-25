export type ImageBytes = {
  mimeType: string;
  bytes: Buffer;
};

export type ImageStore = {
  upload(courseId: string, image: ImageBytes): Promise<string>;
  download(fileId: string): Promise<ImageBytes | null>;
  remove(fileId: string): Promise<void>;
  removeCourse(courseId: string, fileId?: string): Promise<void>;
};

const globalImages = globalThis as unknown as {
  __aolfImages?: Map<string, ImageBytes>;
};

function getMemoryMap(): Map<string, ImageBytes> {
  if (!globalImages.__aolfImages) {
    globalImages.__aolfImages = new Map();
  }
  return globalImages.__aolfImages;
}

export function createMemoryImageStore(): ImageStore {
  return {
    async upload(courseId, image) {
      const fileId = 'image-' + courseId;
      getMemoryMap().set(fileId, {
        mimeType: image.mimeType,
        bytes: Buffer.from(image.bytes)
      });
      return fileId;
    },
    async download(fileId) {
      const stored = getMemoryMap().get(fileId);
      if (!stored) {
        return null;
      }
      return {
        mimeType: stored.mimeType,
        bytes: Buffer.from(stored.bytes)
      };
    },
    async remove(fileId) {
      getMemoryMap().delete(fileId);
    },
    async removeCourse(courseId, fileId) {
      getMemoryMap().delete('image-' + courseId);
      if (fileId) {
        getMemoryMap().delete(fileId);
      }
    }
  };
}

export function decodeImageBase64(
  base64: string,
  mimeType: string
): ImageBytes {
  return {
    mimeType,
    bytes: Buffer.from(String(base64 || '').replace(/\s+/g, ''), 'base64')
  };
}
