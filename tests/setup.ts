import "dotenv/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Los tests nunca usan la base de desarrollo: si hay TEST_DATABASE_URL se apunta a ella.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL ??= "postgresql://invalid:invalid@localhost:1/none";
}

// Archivos de test en un directorio temporal aislado.
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "medapp-test-storage-"));

// Sin emails en la consola durante los tests.
process.env.MAIL_TRANSPORT = "disabled";
