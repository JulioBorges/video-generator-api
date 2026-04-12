export interface StorageService {
  save(id: string, videoBuffer: Buffer): Promise<string>;
  get(id: string): Promise<Buffer>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  getPath(id: string): string;
}
