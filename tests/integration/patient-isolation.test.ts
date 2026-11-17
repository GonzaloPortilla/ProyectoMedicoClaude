/**
 * CRÍTICO — Aislamiento entre pacientes.
 *
 * El Paciente A jamás debe poder ver, descargar, buscar ni borrar información del
 * Paciente B, aunque conozca (o adivine) los identificadores y los use directamente
 * en la URL. Estos tests ejercitan las mismas funciones que usan la ruta
 * /api/files/[fileId] y las páginas /patient/documents/[recordId].
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { file, PDF_BYTES, TRUNCATE_ALL } from "../helpers/fixtures";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("aislamiento entre pacientes", async () => {
  const { db } = await import("@/server/db");
  const { registerPatient, registerDoctor } = await import("@/server/auth/service");
  const { createSession } = await import("@/server/auth/session");
  const { authorizeFileRequest } = await import("@/server/files/access");
  const { patientIdForUser } = await import("@/server/patient/context");
  const records = await import("@/server/medical/records");
  const { searchPatientData } = await import("@/server/medical/search");
  const { getTimeline } = await import("@/server/medical/timeline");
  const health = await import("@/server/medical/health");
  const { getStorage } = await import("@/server/storage");

  let a: { userId: string; patientId: string; token: string };
  let b: { userId: string; patientId: string; token: string };
  let adminToken: string;
  let doctorToken: string;
  let aRecordId: string;
  let aFileId: string;
  let aStorageKey: string;
  let aAllergyId: string;

  async function patient(email: string) {
    const r = await registerPatient({ firstName: "Test", lastName: "Paciente", email, password: "Prueba1234" });
    if (!r.ok) throw new Error(r.error);
    const { token } = await createSession(r.data.userId);
    return { userId: r.data.userId, patientId: await patientIdForUser(r.data.userId), token };
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    a = await patient("paciente.a@test.local");
    b = await patient("paciente.b@test.local");

    const admin = await db.user.create({ data: { email: "admin@test.local", passwordHash: "x", firstName: "Admin", lastName: "Test", roles: { create: { role: "ADMIN" } } } });
    adminToken = (await createSession(admin.id)).token;
    const doc = await registerDoctor({ firstName: "Doc", lastName: "Test", email: "doc@test.local", password: "Prueba1234", specialty: "Clínica", licenseNumber: "1", jurisdiction: "AR-C" });
    if (!doc.ok) throw new Error();
    await db.doctorProfile.updateMany({ data: { verificationStatus: "VERIFIED" } });
    doctorToken = (await createSession(doc.data.userId)).token;

    const created = await records.createRecord(
      a.patientId,
      { userId: a.userId, source: "PATIENT" },
      { title: "Biopsia confidencial de A", occurredOn: new Date("2026-03-01"), categorySlug: "laboratorio", specialty: null, institution: "Clínica Secreta", professionalName: null, description: null, tags: ["privado"] },
      file("biopsia.pdf", PDF_BYTES),
    );
    if (!created.ok) throw new Error(created.error);
    aRecordId = created.data.recordId;
    const f = await db.medicalFile.findFirstOrThrow({ where: { recordId: aRecordId } });
    aFileId = f.id;
    aStorageKey = f.storageKey;

    await health.addHealthEntry(a.patientId, { userId: a.userId, source: "PATIENT" }, "allergy", { name: "Alergia privada de A", severity: "SEVERE", reaction: null });
    aAllergyId = (await db.allergy.findFirstOrThrow({ where: { patientId: a.patientId } })).id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("el dueño (A) sí puede acceder a su archivo", async () => {
    const res = await authorizeFileRequest(a.token, aFileId);
    expect(res.status).toBe(200);
    expect(res.file?.id).toBe(aFileId);
    const bytes = await getStorage().get(res.file!.storageKey);
    expect(new Uint8Array(bytes)).toEqual(PDF_BYTES);
  });

  it("B NO puede descargar el archivo de A usando su id en la URL (/api/files/:id)", async () => {
    const res = await authorizeFileRequest(b.token, aFileId);
    expect(res.status).toBe(404);
    expect(res.file).toBeNull();
  });

  it("la respuesta para B es idéntica a la de un id inexistente (no revela existencia)", async () => {
    const forbidden = await authorizeFileRequest(b.token, aFileId);
    const missing = await authorizeFileRequest(b.token, "id-que-no-existe");
    expect(forbidden).toEqual(missing);
  });

  it("sin sesión o con sesión falsificada no hay acceso", async () => {
    expect((await authorizeFileRequest(undefined, aFileId)).status).toBe(401);
    expect((await authorizeFileRequest("token-falso", aFileId)).status).toBe(401);
  });

  it("ni el administrador ni un médico verificado acceden a archivos de pacientes", async () => {
    expect((await authorizeFileRequest(adminToken, aFileId)).file).toBeNull();
    expect((await authorizeFileRequest(doctorToken, aFileId)).file).toBeNull();
  });

  it("B NO puede ver el detalle del registro de A (/patient/documents/:id)", async () => {
    expect(await records.getRecord(b.patientId, aRecordId)).toBeNull();
    expect(await records.getRecord(a.patientId, aRecordId)).not.toBeNull();
  });

  it("B NO ve los registros de A en su listado, historial ni búsqueda", async () => {
    expect(await records.listRecords(b.patientId)).toHaveLength(0);
    expect(await getTimeline(b.patientId, {})).toHaveLength(0);
    const search = await searchPatientData(b.patientId, "biopsia confidencial");
    expect(search?.total).toBe(0);
    const searchHealth = await searchPatientData(b.patientId, "alergia privada");
    expect(searchHealth?.total).toBe(0);
    // Las instituciones de A tampoco aparecen como opción de B.
    expect(await db.institution.count({ where: { patientId: b.patientId } })).toBe(0);
  });

  it("B NO puede borrar el registro de A (y el archivo sigue intacto)", async () => {
    expect(await records.deleteRecord(b.patientId, aRecordId)).toBe(false);
    expect(await db.medicalRecord.count({ where: { id: aRecordId } })).toBe(1);
    await expect(getStorage().get(aStorageKey)).resolves.toBeInstanceOf(Buffer);
  });

  it("B NO puede borrar datos de salud de A", async () => {
    expect(await health.deleteHealthEntry(b.patientId, "allergy", aAllergyId)).toBe(false);
    expect(await db.allergy.count({ where: { id: aAllergyId } })).toBe(1);
  });

  it("cuando A borra su registro, el archivo desaparece del storage y deja de ser accesible", async () => {
    expect(await records.deleteRecord(a.patientId, aRecordId)).toBe(true);
    expect(await db.medicalFile.count({ where: { id: aFileId } })).toBe(0);
    await expect(getStorage().get(aStorageKey)).rejects.toThrow();
    expect((await authorizeFileRequest(a.token, aFileId)).status).toBe(404);
  });
});
