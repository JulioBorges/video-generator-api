import { Storage } from "@google-cloud/storage";
import type { StorageService } from "./storage.interface";
import { logger } from "../../logger";

export class GcsStorage implements StorageService {
  private storage: Storage;
  private bucket: ReturnType<Storage["bucket"]>;

  constructor(
    private bucketName: string,
    keyFilePath: string,
  ) {
    this.storage = new Storage({ keyFilename: keyFilePath });
    this.bucket = this.storage.bucket(bucketName);
  }

  async save(id: string, videoBuffer: Buffer): Promise<string> {
    const filename = `${id}.mp4`;
    const file = this.bucket.file(filename);
    await file.save(videoBuffer, { contentType: "video/mp4" });
    const gcsPath = `gs://${this.bucketName}/${filename}`;
    logger.debug({ id, gcsPath }, "Video saved to GCS");
    return gcsPath;
  }

  async get(id: string): Promise<Buffer> {
    const file = this.bucket.file(`${id}.mp4`);
    const [exists] = await file.exists();
    if (!exists) throw new Error(`Video not found in GCS: ${id}`);
    const [buffer] = await file.download();
    return buffer;
  }

  async delete(id: string): Promise<void> {
    const file = this.bucket.file(`${id}.mp4`);
    await file.delete({ ignoreNotFound: true });
    logger.debug({ id }, "Video deleted from GCS");
  }

  async exists(id: string): Promise<boolean> {
    const [exists] = await this.bucket.file(`${id}.mp4`).exists();
    return exists;
  }

  getPath(id: string): string {
    return `gs://${this.bucketName}/${id}.mp4`;
  }
}
