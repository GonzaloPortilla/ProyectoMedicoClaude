/** Helpers de tests: usuarios ya verificados y enlaces firmados de archivos. */

export async function verifiedPatient(email: string, password = "Prueba1234", names: { firstName?: string; lastName?: string } = {}) {
  const { registerPatient } = await import("@/server/auth/service");
  const { db } = await import("@/server/db");
  const { patientIdForUser } = await import("@/server/patient/context");
  const r = await registerPatient({ firstName: names.firstName ?? "Pac", lastName: names.lastName ?? (email.split("@")[0]!.replace(/[^a-zA-Z]/g, "") || "Test"), email, password });
  if (!r.ok || !r.data.userId) throw new Error("No se pudo crear el paciente de prueba");
  await db.user.update({ where: { id: r.data.userId }, data: { emailVerifiedAt: new Date() } });
  return { userId: r.data.userId, patientId: await patientIdForUser(r.data.userId) };
}

export async function verifiedDoctor(email: string, license: string, opts: { verified?: boolean } = {}) {
  const { registerDoctor } = await import("@/server/auth/service");
  const { db } = await import("@/server/db");
  const r = await registerDoctor({ firstName: "Doc", lastName: license, email, password: "Prueba1234", specialty: "Clínica médica", licenseNumber: license, jurisdiction: "AR-NAC" });
  if (!r.ok || !r.data.userId) throw new Error("No se pudo crear el médico de prueba");
  await db.user.update({ where: { id: r.data.userId }, data: { emailVerifiedAt: new Date() } });
  if (opts.verified ?? true) await db.doctorProfile.update({ where: { userId: r.data.userId }, data: { verificationStatus: "VERIFIED" } });
  return { userId: r.data.userId };
}

/** Parámetros de un enlace temporal válido emitido para `userId` (como lo haría la página). */
export async function signedParams(userId: string, fileId: string, disposition: "inline" | "attachment" = "inline") {
  const { signedFileUrl } = await import("@/server/files/urls");
  const url = new URL(signedFileUrl(userId, fileId, disposition), "http://localhost");
  return { exp: url.searchParams.get("exp"), sig: url.searchParams.get("sig"), download: url.searchParams.get("download") };
}

/** Request completa a /api/files/[id] con el enlace firmado del propio usuario. */
export async function requestFile(token: string | undefined, userId: string, fileId: string, disposition: "inline" | "attachment" = "inline") {
  const { authorizeFileRequest } = await import("@/server/files/access");
  return authorizeFileRequest(token, fileId, await signedParams(userId, fileId, disposition));
}
