export const FILE_STORAGE = Symbol('FILE_STORAGE');

export type StoredFile = {
  key: string;
  url: string;
  etag?: string;
};

export type StoreFileInput = {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
};

export interface FileStorage {
  readonly name: string;
  upload(input: StoreFileInput): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
