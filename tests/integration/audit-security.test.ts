/**
 * FASE 4 — Auditoría, inmutabilidad, MFA, privacidad y trazabilidad.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { file, PDF_BYTES, TRUNCATE_ALL } from "../helpers/fixtures";
import { requestFile, verifiedDoctor, verifiedPatient } from "../helpers/users";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("auditoría y seguridad", async () => {
  const { db } = await import("@/server/db");
  const { audit } = await import("@/server/audit/log");
  const { listActivity } = await import("@/server/audit/activity");
  const { createSession } = await import("@/server/auth/session");
  const { generateLinkCode } = await import("@/server/access/codes");
  const requests = await import("@/server/access/requests");
  const { getDoctorAccess } = await import("@/server/access/policy");
  const { sweepExpiredGrants } = await import("@/server/access/expiry");
  const records = await import("@/server/medical/records");
  const reports = await import("@/server/medical/reports");
  const mfa = await import("@/server/auth/mfa");
  const { hotp, base32Decode } = await import("@/server/auth/totp");
  const { buildPersonalDataExport } = await import("@/server/privacy/export");

  type P = { userId: string; patientId: string; token: string };
  let A: P, B: P;
  let D: { userId: string; token: string };
  let labRecordId: string, labFileId: string;

  const LAB = { type: "RECORD_CATEGORY" as const, key: "laboratorio" };

  async function grant(p: P, opts: { expiresAt?: Date | null; allowCreate?: boolean } = {}) {
    const { code } = await generateLinkCode(p.patientId);
    const req = await requests.createAccessRequest(D.userId, { code, message: null, requested: [] });
    if (!req.ok) throw new Error(req.error);
    const g = await requests.approveRequest(p.patientId, p.userId, req.data.requestId, { resources: [LAB], allowCreate: opts.allowCreate ?? false, allowUpload: false, expiresAt: opts.expiresAt === undefined ? new Date(Date.now() + 3600_000) : opts.expiresAt });
    if (!g.ok) throw new Error(g.error);
    return g.data.grantId;
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
    const a = await verifiedPatient("a4@test.local");
    const b = await verifiedPatient("b4@test.local");
    const d = await verifiedDoctor("d4@test.local", "MN-44");
    A = { ...a, token: (await createSession(a.userId)).token };
    B = { ...b, token: (await createSession(b.userId)).token };
    D = { userId: d.userId, token: (await createSession(d.userId)).token };
    const r = await records.createRecord(
      A.patientId,
      { userId: A.userId, source: "PATIENT" },
      { title: "Biopsia secreta", occurredOn: new Date("2026-10-12"), categorySlug: "laboratorio", specialty: null, institution: null, professionalName: null, description: "Diagnóstico confidencial", tags: [] },
      file("biopsia-de-ana.pdf", PDF_BYTES),
    );
    if (!r.ok) throw new Error();
    labRecordId = r.data.recordId;
    labFileId = (await db.medicalFile.findFirstOrThrow({ where: { recordId: labRecordId } })).id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("inmutabilidad y cadena de hashes", () => {
    it("la cadena completa verifica íntegra", async () => {
      await audit({ action: "LOGOUT", actorType: "PATIENT", actorUserId: A.userId });
      const problems = await db.$queryRaw<unknown[]>`SELECT * FROM audit_verify_chain()`;
      expect(problems).toEqual([]);
      const last = await db.auditEvent.findFirstOrThrow({ orderBy: { seq: "desc" } });
      expect(last.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("la base rechaza UPDATE, DELETE y TRUNCATE de eventos", async () => {
      const ev = await db.auditEvent.findFirstOrThrow({ orderBy: { seq: "desc" } });
      await expect(db.auditEvent.update({ where: { id: ev.id }, data: { action: "LOGIN_SUCCEEDED" } })).rejects.toThrow();
      await expect(db.auditEvent.delete({ where: { id: ev.id } })).rejects.toThrow();
      await expect(db.auditEvent.deleteMany({})).rejects.toThrow();
      await expect(db.$executeRawUnsafe('TRUNCATE "audit_events"')).rejects.toThrow();
      expect(await db.auditEvent.count({ where: { id: ev.id } })).toBe(1);
    });

    it("si alguien con acceso a la base desactiva las protecciones y altera una fila, la verificación lo detecta", async () => {
      const target = await db.auditEvent.findFirstOrThrow({ where: { actorUserId: A.userId }, orderBy: { seq: "asc" } });
      let detected: { problem: string }[] = [];
      // Todo dentro de una transacción que se revierte: la base de tests queda intacta.
      await db
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe("ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update_delete");
          await tx.$executeRawUnsafe(`UPDATE audit_events SET "actorUserId" = 'otro' WHERE id = '${target.id}'`);
          detected = await tx.$queryRaw<{ problem: string }[]>`SELECT problem FROM audit_verify_chain()`;
          throw new Error("rollback");
        })
        .catch(() => {});
      expect(detected.length).toBeGreaterThan(0);
      expect(detected[0]!.problem).toContain("modificada");
      expect(await db.$queryRaw<unknown[]>`SELECT * FROM audit_verify_chain()`).toEqual([]);
    });
  });

  describe("minimización de datos en el log", () => {
    it("descarta claves fuera de la lista blanca y anonimiza la IP", async () => {
      await audit(
        { action: "PROFILE_UPDATED", actorType: "PATIENT", actorUserId: A.userId, resourceId: "probe-min", metadata: { title: "Biopsia secreta", email: "a4@test.local", password: "x", fields: ["phone"] } },
        { ip: "200.45.67.89", userAgent: "Mozilla/5.0" },
      );
      const ev = await db.auditEvent.findFirstOrThrow({ where: { resourceId: "probe-min" } });
      expect(ev.metadata).toEqual({ fields: ["phone"] });
      expect(ev.ip).toBe("200.45.67.0");
    });

    it("ningún evento guarda títulos, descripciones ni nombres de archivo", async () => {
      await requestFile(A.token, A.userId, labFileId, "attachment");
      const dump = JSON.stringify(await db.auditEvent.findMany({ where: { subjectPatientId: A.patientId } }), (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      expect(dump).not.toContain("Biopsia");
      expect(dump).not.toContain("confidencial");
      expect(dump).not.toContain("biopsia-de-ana");
    });
  });

  describe("eventos del ciclo de acceso", () => {
    it("solicitud, aceptación, acceso, informe, corrección y revocación quedan registrados", async () => {
      const grantId = await grant(A, { allowCreate: true });
      await requestFile(D.token, D.userId, labFileId);
      const access = (await getDoctorAccess(D.userId, A.patientId))!;
      const rep = await reports.createReport(access, { categorySlug: "laboratorio", title: "Informe", content: "Contenido del informe de prueba" });
      if (!rep.ok) throw new Error();
      await reports.correctReport(access, { reportId: rep.data.reportId, title: "Informe", content: "Contenido corregido del informe", changeReason: "Error de tipeo" });
      await requests.revokeGrant(A.patientId, A.userId, grantId);

      const actions = (await db.auditEvent.findMany({ where: { subjectPatientId: A.patientId }, orderBy: { seq: "asc" } })).map((e) => e.action);
      for (const a of ["ACCESS_REQUESTED", "ACCESS_GRANTED", "FILE_VIEWED", "REPORT_CREATED", "REPORT_CORRECTED", "ACCESS_REVOKED"]) expect(actions).toContain(a);
      const corrected = await db.auditEvent.findFirstOrThrow({ where: { action: "REPORT_CORRECTED", subjectPatientId: A.patientId } });
      expect(corrected.metadata).toMatchObject({ fromVersion: 1, toVersion: 2 });
      expect(corrected.actorUserId).toBe(D.userId);
    });

    it("el rechazo y el intento de acceso sin permiso quedan registrados", async () => {
      const { code } = await generateLinkCode(B.patientId);
      const req = await requests.createAccessRequest(D.userId, { code, message: null, requested: [] });
      if (!req.ok) throw new Error();
      await requests.rejectRequest(B.patientId, req.data.requestId, B.userId);
      const bFile = await records.createRecord(B.patientId, { userId: B.userId, source: "PATIENT" }, { title: "X", occurredOn: new Date("2026-01-01"), categorySlug: "laboratorio", specialty: null, institution: null, professionalName: null, description: null, tags: [] }, file("x.pdf", PDF_BYTES));
      if (!bFile.ok) throw new Error();
      const fileId = (await db.medicalFile.findFirstOrThrow({ where: { recordId: bFile.data.recordId } })).id;
      expect((await requestFile(D.token, D.userId, fileId)).status).toBe(404);
      const actions = (await db.auditEvent.findMany({ where: { subjectPatientId: B.patientId } })).map((e) => `${e.action}:${e.outcome}`);
      expect(actions).toContain("ACCESS_REJECTED:SUCCESS");
      expect(actions).toContain("ACCESS_DENIED:DENIED");
    });

    it("el barrido marca los accesos vencidos UNA vez y lo registra", async () => {
      const grantId = await grant(A, { expiresAt: new Date(Date.now() + 3600_000) });
      await db.accessGrant.update({ where: { id: grantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await getDoctorAccess(D.userId, A.patientId)).toBeNull(); // bloqueado antes del barrido
      expect(await sweepExpiredGrants()).toBeGreaterThanOrEqual(1);
      expect(await sweepExpiredGrants()).toBe(0);
      expect((await db.accessGrant.findUniqueOrThrow({ where: { id: grantId } })).status).toBe("EXPIRED");
      expect(await db.auditEvent.count({ where: { action: "ACCESS_EXPIRED", grantId } })).toBe(1);
    });
  });

  describe("Actividad de mi cuenta", () => {
    it("el paciente ve quién accedió a qué, con el título del estudio", async () => {
      const { items } = await listActivity({ userId: A.userId, patientId: A.patientId, filter: "doctors" });
      const texts = items.map((i) => i.text);
      expect(texts.some((t) => t.includes("Dr/a. Doc MN-44") && t.includes("abrió el archivo de «Biopsia secreta — 12 de oct de 2026»"))).toBe(true);
      expect(texts.some((t) => t.includes("Venció el acceso de Dr/a. Doc MN-44"))).toBe(true);
    });

    it("AISLAMIENTO: el paciente B no ve actividad del paciente A", async () => {
      const { items } = await listActivity({ userId: B.userId, patientId: B.patientId, filter: "all", take: 100 });
      const dump = JSON.stringify(items);
      expect(dump).not.toContain("Biopsia");
      expect(items.every((i) => !i.text.includes("Autorizaste"))).toBe(true);
    });

    it("el médico ve su propia actividad pero NO los títulos clínicos (sólo la categoría)", async () => {
      const { items } = await listActivity({ userId: D.userId, patientId: null, filter: "all", take: 100 });
      const dump = JSON.stringify(items);
      expect(dump).not.toContain("Biopsia");
      expect(items.some((i) => i.text.includes("un registro de Laboratorio"))).toBe(true);
    });
  });

  describe("verificación en dos pasos (TOTP)", () => {
    it("configuración, anti-replay, códigos de recuperación de un solo uso y secreto cifrado", async () => {
      const { secret } = await mfa.beginMfaSetup(A.userId);
      const stored = await db.user.findUniqueOrThrow({ where: { id: A.userId } });
      expect(stored.mfaSecretEnc).not.toContain(secret);
      expect(stored.mfaEnabledAt).toBeNull();

      const step = Math.floor(Date.now() / 30000);
      const code = hotp(base32Decode(secret), step);
      const confirmed = await mfa.confirmMfaSetup(A.userId, code);
      if (!confirmed.ok) throw new Error(confirmed.error);
      expect(confirmed.recoveryCodes).toHaveLength(10);
      expect(await db.mfaRecoveryCode.count({ where: { userId: A.userId, codeHash: { in: confirmed.recoveryCodes } } })).toBe(0); // guardados como hash

      expect((await mfa.verifySecondFactor(A.userId, code)).ok).toBe(false); // mismo código: rechazado
      expect(await mfa.verifySecondFactor(A.userId, hotp(base32Decode(secret), step + 1))).toEqual({ ok: true, method: "totp" });
      const recovery = confirmed.recoveryCodes[0]!;
      expect(await mfa.verifySecondFactor(A.userId, recovery.toUpperCase())).toEqual({ ok: true, method: "recovery_code" });
      expect((await mfa.verifySecondFactor(A.userId, recovery)).ok).toBe(false);
      expect(await mfa.remainingRecoveryCodes(A.userId)).toBe(9);
      expect(await db.auditEvent.count({ where: { actorUserId: A.userId, action: "MFA_ENABLED" } })).toBe(1);
    });

    it("desactivar exige contraseña y un código válido", async () => {
      expect(await mfa.disableMfa(A.userId, "Incorrecta1", "000000")).toMatchObject({ ok: false, field: "password" });
      expect(await mfa.disableMfa(A.userId, "Prueba1234", "000000")).toMatchObject({ ok: false, field: "code" });
      const codes = await db.mfaRecoveryCode.count({ where: { userId: A.userId, usedAt: null } });
      expect(codes).toBe(9);
    });
  });

  describe("exportación de datos personales", () => {
    it("incluye los datos propios y nunca secretos ni datos de otros pacientes", async () => {
      const data = await buildPersonalDataExport(A.userId);
      const dump = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      expect(dump).toContain("Biopsia secreta");
      expect(dump).not.toMatch(/passwordHash|mfaSecretEnc|tokenHash|codeHash/);
      expect(dump).not.toContain("b4@test.local");
      expect(dump).not.toContain("argon2");
    });
  });
});
