/** Bytes mínimos con firmas reales de cada formato. */
export const PDF_BYTES = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1"));
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const HTML_BYTES = new Uint8Array(Buffer.from("<html><script>alert(1)</script></html>"));

export function file(name: string, bytes: Uint8Array) {
  return { name, size: bytes.length, bytes };
}

export const TRUNCATE_ALL =
  'TRUNCATE "users", "user_roles", "patient_profiles", "doctor_profiles", "doctor_verifications", "sessions", "password_reset_tokens", "medical_records", "medical_files", "institutions", "access_requests", "access_grants", "access_logs", "patient_link_codes", "medical_reports", "medical_report_versions" CASCADE';
