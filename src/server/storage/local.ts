import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "@/server/storage/types";

/**
 * Driver para desarrollo: guarda los archivos en un directorio fuera de `public/`
 * (no accesible por URL). Sólo para un único servidor.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    // Defensa contra path traversal: la clave debe quedar dentro del directorio raíz.
    if (!/^[a-zA-Z0-9/_-]+$/.test(key)) throw new Error("Clave de storage inválida");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Clave de storage inválida");
    return full;
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    void _contentType; // el sistema de archivos no guarda el tipo; se toma de la base
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, body, { mode: 0o600, flag: "wx" });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
