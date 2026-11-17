import { afterAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasDb)("auth service (integración con PostgreSQL)", async () => {
  const { db } = await import("@/server/db");
  const service = await import("@/server/auth/service");
  const sessions = await import("@/server/auth/session");
  const { hashToken } = await import("@/server/auth/tokens");

  const patient = { firstName: "Test", lastName: "Paciente", email: "paciente@test.local", password: "Prueba1234" };
  const doctor = { firstName: "Test", lastName: "Médica", email: "medica@test.local", password: "Prueba1234", specialty: "Pediatría", licenseNumber: "MP 99", jurisdiction: "AR-X" as const };

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "users", "user_roles", "patient_profiles", "doctor_profiles", "doctor_verifications", "sessions", "password_reset_tokens" CASCADE',
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("registra un paciente con rol y perfil, y la contraseña hasheada", async () => {
    const r = await service.registerPatient(patient);
    expect(r.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: patient.email }, include: { roles: true, patientProfile: true } });
    expect(user.roles.map((x) => x.role)).toEqual(["PATIENT"]);
    expect(user.patientProfile).not.toBeNull();
    expect(user.passwordHash).not.toContain(patient.password);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("no permite emails duplicados", async () => {
    await service.registerPatient(patient);
    const r = await service.registerPatient(patient);
    expect(r).toMatchObject({ ok: false, field: "email" });
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

  it("autentica con credenciales correctas y usa un error genérico si no", async () => {
    await service.registerPatient(patient);
    expect((await service.authenticate(patient.email, patient.password)).ok).toBe(true);
    const wrong = await service.authenticate(patient.email, "Incorrecta1");
    const missing = await service.authenticate("nadie@test.local", "Incorrecta1");
    expect(wrong).toEqual(missing);
  });

  it("rechaza usuarios suspendidos", async () => {
    await service.registerPatient(patient);
    await db.user.update({ where: { email: patient.email }, data: { status: "SUSPENDED" } });
    expect((await service.authenticate(patient.email, patient.password)).ok).toBe(false);
  });

  it("crea sesiones guardando sólo el hash del token, y las invalida", async () => {
    const r = await service.registerPatient(patient);
    if (!r.ok) throw new Error();
    const { token } = await sessions.createSession(r.data.userId);
    const stored = await db.session.findFirstOrThrow();
    expect(stored.id).toBe(hashToken(token));
    expect(stored.id).not.toBe(token);

    const valid = await sessions.validateSessionToken(token);
    expect(valid?.user.email).toBe(patient.email);
    expect(valid?.user.roles).toEqual(["PATIENT"]);

    await sessions.invalidateSessionToken(token);
    expect(await sessions.validateSessionToken(token)).toBeNull();
  });

  it("descarta sesiones expiradas", async () => {
    const r = await service.registerPatient(patient);
    if (!r.ok) throw new Error();
    const { token } = await sessions.createSession(r.data.userId);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await sessions.validateSessionToken(token)).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("recupera la contraseña con un token de un solo uso y cierra sesiones", async () => {
    const r = await service.registerPatient(patient);
    if (!r.ok) throw new Error();
    const { token: sessionToken } = await sessions.createSession(r.data.userId);

    expect(await service.createPasswordResetToken("nadie@test.local")).toBeNull();
    const reset = await service.createPasswordResetToken(patient.email);
    expect(reset).not.toBeNull();
    expect(await service.isPasswordResetTokenValid(reset!.token)).toBe(true);

    const result = await service.resetPasswordWithToken(reset!.token, "NuevaClave99");
    expect(result.ok).toBe(true);
    expect((await service.authenticate(patient.email, "NuevaClave99")).ok).toBe(true);
    expect((await service.authenticate(patient.email, patient.password)).ok).toBe(false);
    expect(await sessions.validateSessionToken(sessionToken)).toBeNull();

    // Reutilizar el token falla
    expect((await service.resetPasswordWithToken(reset!.token, "OtraClave99")).ok).toBe(false);
  });

  it("rechaza tokens de recuperación expirados", async () => {
    await service.registerPatient(patient);
    const reset = await service.createPasswordResetToken(patient.email);
    await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await service.resetPasswordWithToken(reset!.token, "NuevaClave99")).ok).toBe(false);
  });
});
