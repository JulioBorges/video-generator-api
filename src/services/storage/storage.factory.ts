import type { AppConfig } from "../../config";
import type { StorageService } from "./storage.interface";
import { LocalStorage } from "./local.storage";
import { GcsStorage } from "./gcs.storage";

export type { StorageService };

export function createStorageService(config: AppConfig): StorageService {
  if (config.storageType === "gcs") {
    if (!config.gcsBucket || !config.gcsKeyFile) {
      throw new Error("GCS_BUCKET and GCS_KEY_FILE must be set when STORAGE_TYPE=gcs");
    }
    return new GcsStorage(config.gcsBucket, config.gcsKeyFile);
  }
  return new LocalStorage(config.videosDirPath);
}
