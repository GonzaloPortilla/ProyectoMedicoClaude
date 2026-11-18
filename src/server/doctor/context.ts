import "server-only";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { authorizeRole, requireRole, type CurrentUser } from "@/server/auth/dal";
import { getDoctorAccess, type DoctorAccess } from "@/server/access/policy";
import { audit } from "@/server/audit/log";
import { requestContext } from "@/server/audit/request";

async function isVerified(userId: string) {
  const p = await db.doctorProfile.findUnique({ where: { userId }, select: { verificationStatus: true } });
  return p?.verificationStatus === "VERIFIED";
}

/** Para páginas del médico que requieren verificación. */
export async function requireVerifiedDoctor(): Promise<CurrentUser> {
  const user = await requireRole("DOCTOR");
  if (!(await isVerified(user.id))) redirect("/doctor");
  return user;
}

/** Para server actions. */
export async function authorizeVerifiedDoctor(): Promise<CurrentUser | null> {
  const user = await authorizeRole("DOCTOR");
  if (!user || !(await isVerified(user.id))) return null;
  return user;
}

/**
 * Para páginas /doctor/patients/[patientId]/…: exige acceso vigente. Sin acceso responde 404
 * (igual que un paciente inexistente: no se revela si el id existe).
 */
export async function requireDoctorAccess(patientId: string, log?: { action: "PATIENT_SUMMARY_VIEWED" }): Promise<{ user: CurrentUser; access: DoctorAccess }> {
  const user = await requireVerifiedDoctor();
  const access = await getDoctorAccess(user.id, patientId);
  if (!access) {
    // Intento sin acceso vigente (vencido, revocado o id manipulado): se registra si el paciente existe.
    const exists = patientId.length <= 64 && (await db.patientProfile.findUnique({ where: { id: patientId }, select: { id: true } }));
    if (exists) await audit({ action: "ACCESS_DENIED", outcome: "DENIED", actorType: "DOCTOR", actorUserId: user.id, subjectPatientId: patientId, resourceType: "PATIENT", resourceId: patientId }, await requestContext());
    notFound();
  }
  if (log) {
    await audit({ action: log.action, actorType: "DOCTOR", actorUserId: user.id, subjectPatientId: patientId, resourceType: "PATIENT", resourceId: patientId, grantId: access.grantId }, await requestContext());
  }
  return { user, access };
}
