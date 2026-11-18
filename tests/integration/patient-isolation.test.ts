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
import { requestFile, signedParams, verifiedDoctor, verifiedPatient } from "../helpers/users";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("aislamiento entre pacientes", async () => {
  const { db } = await import("@/server/db");
  const { createSession } = await import("@/server/auth/session");
  const { authorizeFileRequest } = await import("@/server/files/access");
  const records = await import("@/server/medical/records");
  const { searchPatientData } = await import("@/server/medical/search");
  const { getTimeline } = await import("@/server/medical/timeline");
  const health = await import("@/server/medical/health");
  const { getStorage } = await import("@/server/storage");

  let a: { userId: string; patientId: string; token: string };
  let b: { userId: string; patientId: string; token: string };
  let admin: { userId: string; token: string };
  let doctor: { userId: string; token: string };
  let aRecordId: string;
  let aFileId: string;
  let aStorageKey: string;
  let aAllergyId: string;

  async function patient(email: string) {
    const p = await verifiedPatient(email);
    return { ...p, token: (await createSession(p.userId)).token };
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    a = await patient("paciente.a@test.local");
    b = await patient("paciente.b@test.local");

    const adminUser = await db.user.create({ data: { email: "admin@test.local", passwordHash: "x", emailVerifiedAt: new Date(), firstName: "Admin", lastName: "Test", roles: { create: { role: "ADMIN" } } } });
    admin = { userId: adminUser.id, token: (await createSession(adminUser.id)).token };
    const doc = await verifiedDoctor("doc@test.local", "MN-1");
    doctor = { userId: doc.userId, token: (await createSession(doc.userId)).token };

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
    const res = await requestFile(a.token, a.userId, aFileId);
    expect(res.status).toBe(200);
    expect(res.file?.id).toBe(aFileId);
    const bytes = await getStorage().get(res.file!.storageKey);
    expect(new Uint8Array(bytes)).toEqual(PDF_BYTES);
  });

  it("B NO puede descargar el archivo de A usando su id en la URL (/api/files/:id)", async () => {
    const res = await requestFile(b.token, b.userId, aFileId);
    expect(res.status).toBe(404);
    expect(res.file).toBeNull();
  });

  it("la respuesta para B es idéntica a la de un id inexistente (no revela existencia)", async () => {
    const forbidden = await requestFile(b.token, b.userId, aFileId);
    const missing = await requestFile(b.token, b.userId, "id-que-no-existe");
    expect(forbidden).toEqual(missing);
  });

  it("el enlace firmado de A no le sirve a B ni a nadie más (está atado al usuario)", async () => {
    const aLink = await signedParams(a.userId, aFileId);
    expect((await authorizeFileRequest(b.token, aFileId, aLink)).status).toBe(404);
    expect((await authorizeFileRequest(a.token, aFileId, aLink)).status).toBe(200);
  });

  it("sin enlace firmado, con firma alterada o vencida, el dueño tampoco descarga (no hay URLs permanentes)", async () => {
    expect((await authorizeFileRequest(a.token, aFileId)).status).toBe(403);
    const link = await signedParams(a.userId, aFileId);
    expect((await authorizeFileRequest(a.token, aFileId, { ...link, sig: link.sig!.slice(0, -2) + "xx" })).status).toBe(403);
    expect((await authorizeFileRequest(a.token, aFileId, { ...link, exp: String(Date.now() - 1000) })).status).toBe(403);
    // Cambiar ver→descargar invalida la firma.
    expect((await authorizeFileRequest(a.token, aFileId, { ...link, download: "1" })).status).toBe(403);
  });

  it("cada visualización y descarga queda auditada", async () => {
    await requestFile(a.token, a.userId, aFileId, "attachment");
    const ev = await db.auditEvent.findMany({ where: { resourceId: aFileId, actorUserId: a.userId } });
    expect(ev.map((e) => e.action)).toEqual(expect.arrayContaining(["FILE_VIEWED", "FILE_DOWNLOADED"]));
  });

  it("sin sesión o con sesión falsificada no hay acceso", async () => {
    expect((await authorizeFileRequest(undefined, aFileId)).status).toBe(401);
    expect((await authorizeFileRequest("token-falso", aFileId)).status).toBe(401);
  });

  it("ni el administrador ni un médico verificado acceden a archivos de pacientes", async () => {
    expect((await requestFile(admin.token, admin.userId, aFileId)).file).toBeNull();
    expect((await requestFile(doctor.token, doctor.userId, aFileId)).file).toBeNull();
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
    expect((await requestFile(a.token, a.userId, aFileId)).status).toBe(404);
  });
});
