import path from "path";
import fs from "fs-extra";
import type { StorageService } from "./storage.interface";
import { logger } from "../../logger";

export class LocalStorage implements StorageService {
  constructor(private videosDirPath: string) {
    fs.ensureDirSync(videosDirPath);
  }

  async save(id: string, videoBuffer: Buffer): Promise<string> {
    const filePath = this.getPath(id);
    await fs.writeFile(filePath, videoBuffer);
    logger.debug({ id, filePath }, "Video saved to local storage");
    return filePath;
  }

  async get(id: string): Promise<Buffer> {
    const filePath = this.getPath(id);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Video not found: ${id}`);
    }
    return fs.readFile(filePath);
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getPath(id);
    await fs.remove(filePath);
    logger.debug({ id }, "Video deleted from local storage");
  }

  async exists(id: string): Promise<boolean> {
    return fs.pathExists(this.getPath(id));
  }

  getPath(id: string): string {
    return path.join(this.videosDirPath, `${id}.mp4`);
  }
}
