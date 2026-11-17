import "server-only";
import { db } from "@/server/db";
import { authorizeRole, requireRole, type CurrentUser } from "@/server/auth/dal";

/**
 * Contexto del paciente para la request actual.
 *
 * El patientId SIEMPRE se deriva de la sesión. Ninguna consulta de información médica
 * acepta un patientId que venga del navegador: así un paciente no puede leer ni modificar
 * datos de otro aunque manipule URLs, formularios o requests.
 */
export type PatientContext = { user: CurrentUser; patientId: string };

export async function patientIdForUser(userId: string): Promise<string> {
  const profile = await db.patientProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  return profile.id;
}

/** Para páginas: redirige si no hay sesión o no es paciente. */
export async function requirePatient(): Promise<PatientContext> {
  const user = await requireRole("PATIENT");
  return { user, patientId: await patientIdForUser(user.id) };
}

/** Para server actions: devuelve null si no corresponde. */
export async function authorizePatient(): Promise<PatientContext | null> {
  const user = await authorizeRole("PATIENT");
  if (!user) return null;
  return { user, patientId: await patientIdForUser(user.id) };
}
