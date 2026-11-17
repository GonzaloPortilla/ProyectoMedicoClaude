import "server-only";
import { randomUUID } from "node:crypto";
import { LocalStorageDriver } from "@/server/storage/local";
import { S3StorageDriver } from "@/server/storage/s3";
import type { StorageDriver } from "@/server/storage/types";

function createDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET es obligatorio con STORAGE_DRIVER=s3");
    return new S3StorageDriver({
      bucket,
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }
  if (driver === "local") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
      console.warn("[storage] Usando almacenamiento local en producción. Configurá STORAGE_DRIVER=s3.");
    }
    return new LocalStorageDriver(process.env.LOCAL_STORAGE_DIR ?? "./storage/private");
  }
  throw new Error(`STORAGE_DRIVER desconocido: ${driver}`);
}

const globalForStorage = globalThis as unknown as { __storage?: StorageDriver };

export function getStorage(): StorageDriver {
  globalForStorage.__storage ??= createDriver();
  return globalForStorage.__storage;
}

/** Clave aleatoria e inadivinable. No incluye nombre de archivo ni identificadores del paciente. */
export function newStorageKey(now: Date = new Date()): string {
  return `medical/${now.getUTCFullYear()}/${randomUUID()}`;
}
