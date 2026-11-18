import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TRUNCATE_ALL } from "../helpers/fixtures";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("autenticación (integración con PostgreSQL)", async () => {
  const { db } = await import("@/server/db");
  const service = await import("@/server/auth/service");
  const sessions = await import("@/server/auth/session");
  const { hashToken } = await import("@/server/auth/tokens");
  const { hash } = await import("@node-rs/argon2");

  const patient = { firstName: "Test", lastName: "Paciente", email: "paciente@test.local", password: "Prueba1234" };
  const doctor = { firstName: "Test", lastName: "Médica", email: "medica@test.local", password: "Prueba1234", specialty: "Pediatría", licenseNumber: "MP 99", jurisdiction: "AR-X" as const };

  async function registerVerified() {
    const r = await service.registerPatient(patient);
    if (!r.ok || !r.data.userId) throw new Error();
    await db.user.update({ where: { id: r.data.userId }, data: { emailVerifiedAt: new Date() } });
    return r.data.userId;
  }
  const events = (userId: string, action: string) => db.auditEvent.findMany({ where: { actorUserId: userId, action: action as never } });

  beforeEach(async () => {
    await db.$executeRawUnsafe(TRUNCATE_ALL);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("registro", () => {
    it("crea paciente con rol, perfil y contraseña con hash Argon2id, sin verificar", async () => {
      const r = await service.registerPatient(patient);
      expect(r.ok).toBe(true);
      const user = await db.user.findUniqueOrThrow({ where: { email: patient.email }, include: { roles: true, patientProfile: true } });
      expect(user.roles.map((x) => x.role)).toEqual(["PATIENT"]);
      expect(user.patientProfile).not.toBeNull();
      expect(user.passwordHash).not.toContain(patient.password);
      expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(user.emailVerifiedAt).toBeNull();
      expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    });

    it("ANTI-ENUMERACIÓN: registrar un email existente responde igual y no crea nada", async () => {
      const first = await service.registerPatient(patient);
      const dup = await service.registerPatient({ ...patient, firstName: "Otro" });
      expect(first.ok).toBe(true);
      expect(dup.ok).toBe(true);
      expect(dup).toEqual({ ok: true, data: { userId: null } });
      expect(await db.user.count()).toBe(1);
      const dupDoctor = await service.registerDoctor({ ...doctor, email: patient.email });
      expect(dupDoctor).toEqual({ ok: true, data: { userId: null } });
      expect(await db.doctorProfile.count()).toBe(0);
    });

    it("registra un médico como PENDIENTE con historial inicial", async () => {
      const r = await service.registerDoctor(doctor);
      expect(r.ok).toBe(true);
      const profile = await db.doctorProfile.findFirstOrThrow({ include: { verifications: true, user: { include: { roles: true } } } });
      expect(profile.verificationStatus).toBe("PENDING");
      expect(profile.verifications).toHaveLength(1);
      expect(profile.user.roles.map((x) => x.role)).toEqual(["DOCTOR"]);
    });

    it("no permite la misma matrícula en la misma jurisdicción", async () => {
      await service.registerDoctor(doctor);
      const r = await service.registerDoctor({ ...doctor, email: "otra@test.local" });
      expect(r).toMatchObject({ ok: false, field: "licenseNumber" });
    });
  });

  describe("verificación de email", () => {
    it("no se puede ingresar sin verificar; el enlace verifica una sola vez", async () => {
      const r = await service.registerPatient(patient);
      const userId = r.ok ? r.data.userId! : "";
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("unverified");
      const token = await service.issueEmailVerification(userId, { force: true });
      expect(await service.verifyEmailToken(token!)).toBe(true);
      expect(await service.verifyEmailToken(token!)).toBe(false);
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("ok");
      expect(await events(userId, "EMAIL_VERIFIED")).toHaveLength(1);
    });

    it("rechaza tokens vencidos o inventados", async () => {
      const r = await service.registerPatient(patient);
      const token = await service.issueEmailVerification(r.ok ? r.data.userId! : "", { force: true });
      await db.emailVerificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await service.verifyEmailToken(token!)).toBe(false);
      expect(await service.verifyEmailToken("inventado")).toBe(false);
    });
  });

  describe("login", () => {
    it("autentica y registra; el error es idéntico para contraseña incorrecta y email inexistente", async () => {
      await registerVerified();
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("ok");
      const wrong = await service.authenticate(patient.email, "Incorrecta1");
      const missing = await service.authenticate("nadie@test.local", "Incorrecta1");
      expect(wrong).toEqual(missing);
      expect(wrong).toEqual({ status: "invalid" });
    });

    it("FUERZA BRUTA: bloquea la cuenta tras 5 fallos, incluso con la contraseña correcta", async () => {
      const userId = await registerVerified();
      for (let i = 0; i < 4; i++) expect((await service.authenticate(patient.email, "Incorrecta1")).status).toBe("invalid");
      expect((await service.authenticate(patient.email, "Incorrecta1")).status).toBe("locked");
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("locked");
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
      expect(await events(userId, "LOGIN_LOCKED")).toHaveLength(1);
      expect((await events(userId, "LOGIN_FAILED")).length).toBeGreaterThanOrEqual(6);
      // Al vencer el bloqueo, la contraseña correcta vuelve a funcionar y el contador se reinicia.
      await db.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("ok");
      expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).failedLoginCount).toBe(0);
    });

    it("los emails inexistentes también se frenan con el mismo umbral (no revela qué cuentas existen)", async () => {
      const results = [];
      for (let i = 0; i < 6; i++) results.push((await service.authenticate("fantasma@test.local", "Incorrecta1")).status);
      expect(results.slice(0, 5)).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid"]);
      expect(results[5]).toBe("locked");
    });

    it("rechaza usuarios suspendidos", async () => {
      await registerVerified();
      await db.user.update({ where: { email: patient.email }, data: { status: "SUSPENDED" } });
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("suspended");
    });

    it("vuelve a hashear contraseñas guardadas con parámetros débiles", async () => {
      const userId = await registerVerified();
      const weak = await hash(patient.password, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
      await db.user.update({ where: { id: userId }, data: { passwordHash: weak } });
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("ok");
      const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(after.passwordHash).not.toBe(weak);
      expect(after.passwordHash).toContain("m=19456,t=2,p=1");
    });

    it("indica si la cuenta requiere segundo factor", async () => {
      const userId = await registerVerified();
      await db.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date(), mfaSecretEnc: "x" } });
      expect(await service.authenticate(patient.email, patient.password)).toEqual({ status: "ok", userId, mfaRequired: true });
    });
  });

  describe("sesiones", () => {
    it("guarda sólo el hash del token y se invalida al cerrar sesión", async () => {
      const userId = await registerVerified();
      const { token } = await sessions.createSession(userId);
      const stored = await db.session.findFirstOrThrow();
      expect(stored.id).toBe(hashToken(token));
      expect(stored.id).not.toBe(token);
      const valid = await sessions.validateSessionToken(token);
      expect(valid?.user.email).toBe(patient.email);
      expect(valid?.user.roles).toEqual(["PATIENT"]);
      await sessions.invalidateSessionToken(token);
      expect(await sessions.validateSessionToken(token)).toBeNull();
    });

    it("vence por tiempo absoluto", async () => {
      const userId = await registerVerified();
      const { token } = await sessions.createSession(userId);
      await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await sessions.validateSessionToken(token)).toBeNull();
      expect(await db.session.count()).toBe(0);
    });

    it("vence por inactividad (24 h paciente, 2 h médico/administrador)", async () => {
      const userId = await registerVerified();
      const { token } = await sessions.createSession(userId);
      const now = Date.now();
      expect(await sessions.validateSessionToken(token, new Date(now + 23 * 3600_000))).not.toBeNull();
      await db.session.updateMany({ data: { lastSeenAt: new Date(now) } });
      expect(await sessions.validateSessionToken(token, new Date(now + 25 * 3600_000))).toBeNull();

      expect(sessions.sessionPolicy(["DOCTOR"])).toEqual({ absoluteMs: 12 * 3600_000, idleMs: 2 * 3600_000 });
      expect(sessions.sessionPolicy(["ADMIN"]).idleMs).toBe(2 * 3600_000);
      expect(sessions.sessionPolicy(["PATIENT"]).absoluteMs).toBe(7 * 24 * 3600_000);
    });

    it("guarda la IP anonimizada", async () => {
      const userId = await registerVerified();
      await sessions.createSession(userId, { ipAddress: "190.12.34.56", userAgent: "Mozilla/5.0" });
      expect((await db.session.findFirstOrThrow()).ipAddress).toBe("190.12.34.0");
    });

    it("un usuario no puede cerrar la sesión de otro con su id público", async () => {
      const userId = await registerVerified();
      const { publicId } = await sessions.createSession(userId);
      expect(await sessions.revokeUserSession("otro-usuario", publicId)).toBe(false);
      expect(await db.session.count()).toBe(1);
      expect(await sessions.revokeUserSession(userId, publicId)).toBe(true);
    });
  });

  describe("contraseñas", () => {
    it("recupera la contraseña con un token de un solo uso y cierra todas las sesiones", async () => {
      const userId = await registerVerified();
      const { token: sessionToken } = await sessions.createSession(userId);
      expect(await service.createPasswordResetToken("nadie@test.local")).toBeNull();
      const reset = await service.createPasswordResetToken(patient.email);
      expect(await service.isPasswordResetTokenValid(reset!.token)).toBe(true);
      expect((await service.resetPasswordWithToken(reset!.token, "NuevaClave99")).ok).toBe(true);
      expect((await service.authenticate(patient.email, "NuevaClave99")).status).toBe("ok");
      expect((await service.authenticate(patient.email, patient.password)).status).toBe("invalid");
      expect(await sessions.validateSessionToken(sessionToken)).toBeNull();
      expect((await service.resetPasswordWithToken(reset!.token, "OtraClave99")).ok).toBe(false);
      expect(await events(userId, "PASSWORD_RESET_COMPLETED")).toHaveLength(1);
    });

    it("rechaza tokens de recuperación expirados", async () => {
      await registerVerified();
      const reset = await service.createPasswordResetToken(patient.email);
      await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await service.resetPasswordWithToken(reset!.token, "NuevaClave99")).ok).toBe(false);
    });

    it("el cambio de contraseña exige la actual y cierra las OTRAS sesiones", async () => {
      const userId = await registerVerified();
      const current = await sessions.createSession(userId);
      const other = await sessions.createSession(userId);
      const currentId = hashToken(current.token);
      expect(await service.changePassword(userId, "Incorrecta1", "NuevaClave99", currentId)).toMatchObject({ ok: false, field: "currentPassword" });
      expect(await service.changePassword(userId, patient.password, "NuevaClave99", currentId)).toEqual({ ok: true, data: { sessionsRevoked: 1 } });
      expect(await sessions.validateSessionToken(current.token)).not.toBeNull();
      expect(await sessions.validateSessionToken(other.token)).toBeNull();
    });
  });
});
