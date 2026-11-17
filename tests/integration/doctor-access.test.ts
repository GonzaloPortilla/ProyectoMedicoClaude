/**
 * CASOS DE SEGURIDAD OBLIGATORIOS — Fase 3 (médicos, solicitudes y permisos)
 *
 * 1. Médico sin autorización no accede al paciente.
 * 2. Médico autorizado para Paciente A no accede a Paciente B.
 * 3. Médico autorizado sólo para Laboratorio no accede a Cardiología.
 * 4. Acceso vencido deja de funcionar.
 * 5. Acceso revocado deja de funcionar inmediatamente.
 * 6. Manipular identificadores en URL/API no permite saltar permisos.
 *
 * Se ejercitan las mismas funciones que usan las páginas /doctor/patients/[patientId]/…,
 * la ruta /api/files/[fileId] y las server actions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { file, PDF_BYTES, TRUNCATE_ALL } from "../helpers/fixtures";
import type { ResourceRef } from "@/features/access/resources";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("acceso de médicos a pacientes", async () => {
  const { db } = await import("@/server/db");
  const { registerPatient, registerDoctor } = await import("@/server/auth/service");
  const { createSession } = await import("@/server/auth/session");
  const { patientIdForUser } = await import("@/server/patient/context");
  const { generateLinkCode } = await import("@/server/access/codes");
  const requests = await import("@/server/access/requests");
  const { getDoctorAccess } = await import("@/server/access/policy");
  const view = await import("@/server/access/doctor-view");
  const { authorizeFileRequest } = await import("@/server/files/access");
  const records = await import("@/server/medical/records");
  const reports = await import("@/server/medical/reports");
  const health = await import("@/server/medical/health");

  type Patient = { userId: string; patientId: string; token: string };
  type Doctor = { userId: string; token: string };
  let A: Patient, B: Patient;
  let D1: Doctor, D2: Doctor, Dpending: Doctor;
  const rec: Record<string, { recordId: string; fileId: string }> = {};

  const LAB: ResourceRef = { type: "RECORD_CATEGORY", key: "laboratorio" };
  const CARDIO: ResourceRef = { type: "RECORD_CATEGORY", key: "cardiologia" };
  const GENERAL: ResourceRef = { type: "HEALTH_SECTION", key: "GENERAL" };
  const ALLERGIES: ResourceRef = { type: "HEALTH_SECTION", key: "ALLERGIES" };

  async function patient(email: string): Promise<Patient> {
    const r = await registerPatient({ firstName: "Pac", lastName: email.split("@")[0]!, email, password: "Prueba1234" });
    if (!r.ok) throw new Error(r.error);
    return { userId: r.data.userId, patientId: await patientIdForUser(r.data.userId), token: (await createSession(r.data.userId)).token };
  }
  async function doctor(email: string, license: string, verified = true): Promise<Doctor> {
    const r = await registerDoctor({ firstName: "Doc", lastName: license, email, password: "Prueba1234", specialty: "Clínica médica", licenseNumber: license, jurisdiction: "AR-NAC" });
    if (!r.ok) throw new Error(r.error);
    if (verified) await db.doctorProfile.update({ where: { userId: r.data.userId }, data: { verificationStatus: "VERIFIED" } });
    return { userId: r.data.userId, token: (await createSession(r.data.userId)).token };
  }
  async function addRecord(p: Patient, slug: string, title: string) {
    const r = await records.createRecord(
      p.patientId,
      { userId: p.userId, source: "PATIENT" },
      { title, occurredOn: new Date("2026-05-01"), categorySlug: slug, specialty: null, institution: null, professionalName: null, description: null, tags: [] },
      file(`${slug}.pdf`, PDF_BYTES),
    );
    if (!r.ok) throw new Error(r.error);
    const f = await db.medicalFile.findFirstOrThrow({ where: { recordId: r.data.recordId } });
    return { recordId: r.data.recordId, fileId: f.id };
  }
  /** Flujo completo: código del paciente → solicitud del médico → aprobación del paciente. */
  async function grant(p: Patient, d: Doctor, resources: ResourceRef[], opts: { expiresAt?: Date | null; allowCreate?: boolean; allowUpload?: boolean } = {}) {
    const { code } = await generateLinkCode(p.patientId);
    const req = await requests.createAccessRequest(d.userId, { code, message: null, requested: [] });
    if (!req.ok) throw new Error(req.error);
    const g = await requests.approveRequest(p.patientId, p.userId, req.data.requestId, {
      resources,
      allowCreate: opts.allowCreate ?? false,
      allowUpload: opts.allowUpload ?? false,
      expiresAt: opts.expiresAt === undefined ? new Date(Date.now() + 3600_000) : opts.expiresAt,
    });
    if (!g.ok) throw new Error(g.error);
    return g.data.grantId;
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    A = await patient("a@test.local");
    B = await patient("b@test.local");
    D1 = await doctor("d1@test.local", "MN-1");
    D2 = await doctor("d2@test.local", "MN-2");
    Dpending = await doctor("d3@test.local", "MN-3", false);
    rec.aLab = await addRecord(A, "laboratorio", "Hemograma de A");
    rec.aCardio = await addRecord(A, "cardiologia", "ECG de A");
    rec.aMental = await addRecord(A, "salud-mental", "Sesión de terapia de A");
    rec.bLab = await addRecord(B, "laboratorio", "Hemograma de B");
    await health.addHealthEntry(A.patientId, { userId: A.userId, source: "PATIENT" }, "allergy", { name: "Penicilina", severity: "SEVERE", reaction: null });
    await health.addHealthEntry(A.patientId, { userId: A.userId, source: "PATIENT" }, "medication", { name: "Enalapril", dosage: null, frequency: null, startedOn: null });
  });

  beforeEach(async () => {
    // Cada test arranca sin accesos.
    await db.accessPermission.deleteMany();
    await db.accessGrant.deleteMany();
    await db.accessRequest.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  // ── 1 ────────────────────────────────────────────────────────────────────
  describe("1. médico sin autorización", () => {
    it("no obtiene acceso al paciente", async () => {
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
    });
    it("no puede abrir archivos del paciente aunque conozca el id", async () => {
      expect((await authorizeFileRequest(D1.token, rec.aLab!.fileId)).status).toBe(404);
    });
    it("una solicitud pendiente (sin aprobar) no otorga acceso", async () => {
      const { code } = await generateLinkCode(A.patientId);
      expect((await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] })).ok).toBe(true);
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
    });
    it("una solicitud rechazada no otorga acceso y no puede aprobarse después", async () => {
      const { code } = await generateLinkCode(A.patientId);
      const req = await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      expect(await requests.rejectRequest(A.patientId, req.data.requestId)).toBe(true);
      const late = await requests.approveRequest(A.patientId, A.userId, req.data.requestId, { resources: [LAB], allowCreate: false, allowUpload: false, expiresAt: null });
      expect(late.ok).toBe(false);
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
    });
    it("un médico no verificado no puede solicitar acceso", async () => {
      const { code } = await generateLinkCode(A.patientId);
      expect((await requests.createAccessRequest(Dpending.userId, { code, message: null, requested: [] })).ok).toBe(false);
    });
    it("si el admin retira la verificación, el médico pierde sus accesos", async () => {
      await grant(A, D2, [LAB]);
      expect(await getDoctorAccess(D2.userId, A.patientId)).not.toBeNull();
      await db.doctorProfile.update({ where: { userId: D2.userId }, data: { verificationStatus: "REJECTED" } });
      expect(await getDoctorAccess(D2.userId, A.patientId)).toBeNull();
      expect((await authorizeFileRequest(D2.token, rec.aLab!.fileId)).status).toBe(404);
      await db.doctorProfile.update({ where: { userId: D2.userId }, data: { verificationStatus: "VERIFIED" } });
    });
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  describe("2. autorizado para A no accede a B", () => {
    it("no obtiene acceso a B", async () => {
      await grant(A, D1, [LAB, GENERAL]);
      expect(await getDoctorAccess(D1.userId, A.patientId)).not.toBeNull();
      expect(await getDoctorAccess(D1.userId, B.patientId)).toBeNull();
    });
    it("no puede abrir archivos de B", async () => {
      await grant(A, D1, [LAB]);
      expect((await authorizeFileRequest(D1.token, rec.aLab!.fileId)).status).toBe(200);
      expect((await authorizeFileRequest(D1.token, rec.bLab!.fileId)).status).toBe(404);
    });
    it("otro médico tampoco hereda el acceso de D1", async () => {
      await grant(A, D1, [LAB]);
      expect(await getDoctorAccess(D2.userId, A.patientId)).toBeNull();
      expect((await authorizeFileRequest(D2.token, rec.aLab!.fileId)).status).toBe(404);
    });
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  describe("3. sólo Laboratorio → no Cardiología", () => {
    it("el historial devuelto por el backend sólo contiene Laboratorio", async () => {
      await grant(A, D1, [LAB]);
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const timeline = await view.getTimelineForDoctor(access);
      expect(timeline.map((t) => t.title)).toEqual(["Hemograma de A"]);
      expect(timeline.some((t) => t.categorySlug !== "laboratorio")).toBe(false);
    });
    it("el detalle de un registro de Cardiología o Salud mental no se devuelve", async () => {
      await grant(A, D1, [LAB]);
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      expect(await view.getRecordForDoctor(access, rec.aLab!.recordId)).not.toBeNull();
      expect(await view.getRecordForDoctor(access, rec.aCardio!.recordId)).toBeNull();
      expect(await view.getRecordForDoctor(access, rec.aMental!.recordId)).toBeNull();
    });
    it("el archivo de Cardiología no se puede descargar", async () => {
      await grant(A, D1, [LAB]);
      expect((await authorizeFileRequest(D1.token, rec.aCardio!.fileId)).status).toBe(404);
    });
    it("las secciones de salud no autorizadas no se consultan (null), las autorizadas sí", async () => {
      await grant(A, D1, [LAB, ALLERGIES]);
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const overview = await view.getPatientOverviewForDoctor(access);
      expect(overview.allergies?.map((a) => a.name)).toEqual(["Penicilina"]);
      expect(overview.medications).toBeNull();
      expect(overview.general).toBeNull();
      expect(overview.conditions).toBeNull();
    });
    it("no puede crear informes sin permiso de creación, ni en categorías no autorizadas", async () => {
      await grant(A, D1, [LAB]); // sólo VIEW
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      expect((await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe", content: "Contenido del informe" })).ok).toBe(false);
      await grant(A, D1, [LAB], { allowCreate: true });
      const access2 = (await getDoctorAccess(D1.userId, A.patientId))!;
      expect((await reports.createReport(access2, { categorySlug: "cardiologia", title: "Informe", content: "Contenido del informe" })).ok).toBe(false);
      expect((await reports.createReport(access2, { categorySlug: "laboratorio", title: "Informe", content: "Contenido del informe" })).ok).toBe(true);
    });
    it("adjuntar archivos exige permiso UPLOAD", async () => {
      await grant(A, D1, [LAB], { allowCreate: true, allowUpload: false });
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const r = await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe", content: "Contenido del informe" }, file("x.pdf", PDF_BYTES));
      expect(r).toMatchObject({ ok: false, field: "file" });
    });
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  describe("4. acceso vencido", () => {
    it("deja de funcionar en cuanto vence (evaluado en el backend)", async () => {
      const grantId = await grant(A, D1, [LAB]);
      expect(await getDoctorAccess(D1.userId, A.patientId)).not.toBeNull();
      // Simula el paso del tiempo: el grant venció hace 1 segundo.
      await db.accessGrant.update({ where: { id: grantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
      expect((await authorizeFileRequest(D1.token, rec.aLab!.fileId)).status).toBe(404);
      expect(await requests.listActiveGrantsForDoctor(D1.userId)).toHaveLength(0);
    });
    it("la política compara contra el instante actual", async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      await grant(A, D1, [LAB], { expiresAt });
      expect(await getDoctorAccess(D1.userId, A.patientId, new Date(expiresAt.getTime() - 1))).not.toBeNull();
      expect(await getDoctorAccess(D1.userId, A.patientId, expiresAt)).toBeNull();
      expect(await getDoctorAccess(D1.userId, A.patientId, new Date(expiresAt.getTime() + 1))).toBeNull();
    });
    it("un acceso permanente no vence hasta que se revoca", async () => {
      await grant(A, D1, [LAB], { expiresAt: null });
      expect(await getDoctorAccess(D1.userId, A.patientId, new Date("2099-01-01"))).not.toBeNull();
    });
    it("no se puede aprobar con una fecha de vencimiento pasada", async () => {
      const { code } = await generateLinkCode(A.patientId);
      const req = await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      const r = await requests.approveRequest(A.patientId, A.userId, req.data.requestId, { resources: [LAB], allowCreate: false, allowUpload: false, expiresAt: new Date(Date.now() - 1) });
      expect(r.ok).toBe(false);
    });
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  describe("5. acceso revocado", () => {
    it("deja de funcionar inmediatamente", async () => {
      const grantId = await grant(A, D1, [LAB], { expiresAt: null });
      expect((await authorizeFileRequest(D1.token, rec.aLab!.fileId)).status).toBe(200);
      expect(await requests.revokeGrant(A.patientId, A.userId, grantId)).toBe(true);
      // La siguiente consulta ya no encuentra acceso.
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
      expect((await authorizeFileRequest(D1.token, rec.aLab!.fileId)).status).toBe(404);
    });
    it("un acceso ya obtenido (objeto en memoria) no sirve para crear informes tras revocar", async () => {
      const grantId = await grant(A, D1, [LAB], { allowCreate: true });
      expect(await getDoctorAccess(D1.userId, A.patientId)).not.toBeNull();
      await requests.revokeGrant(A.patientId, A.userId, grantId);
      // Las server actions siempre vuelven a pedir el acceso: tras revocar, no hay.
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
    });
    it("sólo el paciente dueño puede revocar su acceso", async () => {
      const grantId = await grant(A, D1, [LAB]);
      expect(await requests.revokeGrant(B.patientId, B.userId, grantId)).toBe(false);
      expect(await getDoctorAccess(D1.userId, A.patientId)).not.toBeNull();
    });
    it("una nueva autorización reemplaza a la anterior (no se acumulan permisos)", async () => {
      await grant(A, D1, [LAB, CARDIO]);
      await grant(A, D1, [LAB]);
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      expect(await view.getRecordForDoctor(access, rec.aCardio!.recordId)).toBeNull();
      expect(await db.accessGrant.count({ where: { patientId: A.patientId, doctorUserId: D1.userId, status: "ACTIVE" } })).toBe(1);
    });
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  describe("6. manipulación de identificadores", () => {
    it("un recordId de otro paciente bajo el acceso de A no devuelve nada", async () => {
      await grant(A, D1, [LAB]);
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      expect(await view.getRecordForDoctor(access, rec.bLab!.recordId)).toBeNull();
    });
    it("cambiar el patientId en la URL por el de B no da acceso", async () => {
      await grant(A, D1, [LAB]);
      expect(await getDoctorAccess(D1.userId, B.patientId)).toBeNull();
      expect(await getDoctorAccess(D1.userId, "id-inventado")).toBeNull();
    });
    it("B no puede aprobar una solicitud dirigida a A", async () => {
      const { code } = await generateLinkCode(A.patientId);
      const req = await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      const r = await requests.approveRequest(B.patientId, B.userId, req.data.requestId, { resources: [LAB], allowCreate: false, allowUpload: false, expiresAt: null });
      expect(r.ok).toBe(false);
      expect(await getDoctorAccess(D1.userId, A.patientId)).toBeNull();
      expect(await getDoctorAccess(D1.userId, B.patientId)).toBeNull();
    });
    it("recursos inventados en la aprobación se descartan", async () => {
      const { code } = await generateLinkCode(A.patientId);
      const req = await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      const r = await requests.approveRequest(A.patientId, A.userId, req.data.requestId, {
        resources: [{ type: "RECORD_CATEGORY", key: "*" }, { type: "HEALTH_SECTION", key: "EMERGENCY_CONTACTS" }],
        allowCreate: false,
        allowUpload: false,
        expiresAt: null,
      });
      expect(r.ok).toBe(false);
    });
    it("el código de vinculación es de un solo uso", async () => {
      const { code } = await generateLinkCode(A.patientId);
      expect((await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] })).ok).toBe(true);
      expect((await requests.createAccessRequest(D2.userId, { code, message: null, requested: [] })).ok).toBe(false);
    });
    it("un código vencido no sirve", async () => {
      const { code } = await generateLinkCode(A.patientId);
      await db.patientLinkCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] })).ok).toBe(false);
    });
    it("un médico no puede cancelar solicitudes de otro médico", async () => {
      const { code } = await generateLinkCode(A.patientId);
      const req = await requests.createAccessRequest(D1.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      expect(await requests.cancelRequest(D2.userId, req.data.requestId)).toBe(false);
    });
    it("el administrador no puede abrir archivos de pacientes", async () => {
      const admin = await db.user.create({ data: { email: `adm${Date.now()}@test.local`, passwordHash: "x", firstName: "A", lastName: "D", roles: { create: { role: "ADMIN" } } } });
      const { token } = await createSession(admin.id);
      expect((await authorizeFileRequest(token, rec.aLab!.fileId)).status).toBe(404);
    });
  });

  // ── Informes ─────────────────────────────────────────────────────────────
  describe("informes médicos", () => {
    it("registran médico, matrícula, especialidad y fecha; corregir conserva la versión anterior", async () => {
      await grant(A, D1, [LAB], { allowCreate: true });
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const created = await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe de laboratorio", content: "Valores dentro de rango normal." });
      if (!created.ok) throw new Error(created.error);
      const report = await db.medicalReport.findUniqueOrThrow({ where: { id: created.data.reportId }, include: { record: true } });
      expect(report.licenseNumber).toBe("MN-1");
      expect(report.specialty).toBe("Clínica médica");
      expect(report.authorName).toBe("Doc MN-1");
      expect(report.record.source).toBe("DOCTOR");
      expect(report.record.createdById).toBe(D1.userId);

      const corrected = await reports.correctReport(access, { reportId: report.id, title: "Informe de laboratorio (corregido)", content: "Glucemia levemente elevada.", changeReason: "Error de transcripción" });
      expect(corrected).toMatchObject({ ok: true, data: { version: 2 } });
      const versions = await db.medicalReportVersion.findMany({ where: { reportId: report.id }, orderBy: { version: "asc" } });
      expect(versions.map((v) => v.content)).toEqual(["Valores dentro de rango normal.", "Glucemia levemente elevada."]);
      expect(versions[1]!.changeReason).toBe("Error de transcripción");
    });

    it("la base de datos rechaza modificar o borrar una versión (no se puede reemplazar en silencio)", async () => {
      await grant(A, D1, [LAB], { allowCreate: true });
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const created = await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe", content: "Contenido original del informe." });
      if (!created.ok) throw new Error();
      await expect(db.medicalReportVersion.updateMany({ where: { reportId: created.data.reportId }, data: { content: "alterado" } })).rejects.toThrow();
      await expect(db.medicalReportVersion.deleteMany({ where: { reportId: created.data.reportId } })).rejects.toThrow();
    });

    it("sólo el autor puede corregir su informe", async () => {
      await grant(A, D1, [LAB], { allowCreate: true });
      await grant(A, D2, [LAB], { allowCreate: true });
      const a1 = (await getDoctorAccess(D1.userId, A.patientId))!;
      const a2 = (await getDoctorAccess(D2.userId, A.patientId))!;
      const created = await reports.createReport(a1, { categorySlug: "laboratorio", title: "Informe", content: "Contenido original del informe." });
      if (!created.ok) throw new Error();
      expect((await reports.correctReport(a2, { reportId: created.data.reportId, title: "X", content: "Contenido alterado del informe", changeReason: "Intento ajeno" })).ok).toBe(false);
    });

    it("el paciente no puede borrar un informe creado por un médico", async () => {
      await grant(A, D1, [LAB], { allowCreate: true });
      const access = (await getDoctorAccess(D1.userId, A.patientId))!;
      const created = await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe", content: "Contenido original del informe." });
      if (!created.ok) throw new Error();
      expect(await records.deleteRecord(A.patientId, created.data.recordId)).toBe(false);
    });

    it("cada acceso del médico queda registrado", async () => {
      await grant(A, D1, [LAB]);
      await authorizeFileRequest(D1.token, rec.aLab!.fileId);
      const logs = await db.accessLog.findMany({ where: { patientId: A.patientId, actorUserId: D1.userId, action: "VIEW_FILE" } });
      expect(logs.length).toBeGreaterThan(0);
      await expect(db.accessLog.updateMany({ where: { id: logs[0]!.id }, data: { action: "VIEW_PATIENT" } })).rejects.toThrow();
    });
  });
});
