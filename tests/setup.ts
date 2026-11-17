import "dotenv/config";

// Los tests nunca usan la base de desarrollo: si hay TEST_DATABASE_URL se apunta a ella.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DATABASE_URL ??= "postgresql://invalid:invalid@localhost:1/none";
}
