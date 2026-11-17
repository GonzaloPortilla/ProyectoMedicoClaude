import "server-only";
import { db } from "@/server/db";

/**
 * El perfil del paciente sólo se lee para su propio usuario.
 * El userId siempre proviene de la sesión (requireRole), nunca de la request.
 */
export async function getOwnPatientProfile(userId: string) {
  return db.patientProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, sex: true, documentId: true, phone: true, province: true, city: true, updatedAt: true },
  });
}

export type OwnPatientProfile = NonNullable<Awaited<ReturnType<typeof getOwnPatientProfile>>>;

const PROFILE_FIELDS = ["dateOfBirth", "sex", "documentId", "phone", "province", "city"] as const;

export function profileCompletion(profile: OwnPatientProfile | null): { done: number; total: number; percent: number } {
  const total = PROFILE_FIELDS.length;
  const done = profile ? PROFILE_FIELDS.filter((f) => profile[f] !== null && profile[f] !== "").length : 0;
  return { done, total, percent: Math.round((done / total) * 100) };
}
