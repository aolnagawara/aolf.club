export type PamphletBytes = {
  mimeType: string;
  bytes: Buffer;
};

export type PamphletStore = {
  upload(
    courseId: string,
    pamphlet: PamphletBytes
  ): Promise<string>;
  download(fileId: string): Promise<PamphletBytes | null>;
  remove(fileId: string): Promise<void>;
};

const globalPamphlets = globalThis as unknown as {
  __aolfPamphlets?: Map<string, PamphletBytes>;
};

function getMemoryMap(): Map<string, PamphletBytes> {
  if (!globalPamphlets.__aolfPamphlets) {
    globalPamphlets.__aolfPamphlets = new Map();
  }
  return globalPamphlets.__aolfPamphlets;
}

export function createMemoryPamphletStore(): PamphletStore {
  return {
    async upload(courseId, pamphlet) {
      const fileId = 'pamphlet-' + courseId;
      getMemoryMap().set(fileId, {
        mimeType: pamphlet.mimeType,
        bytes: Buffer.from(pamphlet.bytes)
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
    }
  };
}

export function decodePamphletBase64(
  base64: string,
  mimeType: string
): PamphletBytes {
  return {
    mimeType,
    bytes: Buffer.from(String(base64 || '').replace(/\s+/g, ''), 'base64')
  };
}
