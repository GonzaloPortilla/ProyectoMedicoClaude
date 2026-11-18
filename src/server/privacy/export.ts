import "server-only";
import { db } from "@/server/db";

/**
 * Exportación de datos personales (portabilidad). Incluye todo lo que la cuenta tiene
 * sobre la persona, en JSON legible. Los archivos se listan con sus metadatos; sus bytes
 * se descargan desde la aplicación (una futura versión puede empaquetarlos en un ZIP).
 * Nunca incluye hashes de contraseña, tokens, secretos MFA ni datos de otros pacientes.
 */
export async function buildPersonalDataExport(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      mfaEnabledAt: true,
      roles: { select: { role: true, grantedAt: true } },
      doctorProfile: { select: { specialty: true, licenseNumber: true, jurisdiction: true, verificationStatus: true, verifiedAt: true, verifications: { select: { status: true, note: true, createdAt: true } } } },
    },
  });
  const patient = await db.patientProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      dateOfBirth: true,
      sex: true,
      documentId: true,
      phone: true,
      province: true,
      city: true,
      healthProfile: { select: { bloodType: true, heightCm: true, weightKg: true, updatedAt: true } },
      emergencyProfile: { select: { showBloodType: true, showAllergies: true, showConditions: true, showMedications: true, showEmergencyContacts: true, additionalNotes: true } },
      emergencyContacts: { select: { name: true, relationship: true, phone: true } },
      allergies: { select: { name: true, severity: true, reaction: true, source: true, createdAt: true } },
      conditions: { select: { name: true, status: true, diagnosedOn: true, notes: true, source: true, createdAt: true } },
      medications: { select: { name: true, dosage: true, frequency: true, startedOn: true, notes: true, source: true, createdAt: true } },
      surgeries: { select: { name: true, performedOn: true, notes: true, source: true, institution: { select: { name: true } } } },
      hospitalizations: { select: { reason: true, admittedOn: true, dischargedOn: true, notes: true, source: true, institution: { select: { name: true } } } },
      vaccinations: { select: { name: true, dose: true, administeredOn: true, notes: true, source: true } },
      familyHistory: { select: { relationship: true, condition: true, notes: true, source: true } },
      records: {
        orderBy: { occurredOn: "desc" },
        select: {
          title: true,
          occurredOn: true,
          specialty: true,
          professionalName: true,
          description: true,
          tags: true,
          source: true,
          createdAt: true,
          category: { select: { name: true } },
          institution: { select: { name: true } },
          files: { select: { originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } },
          report: { select: { authorName: true, licenseNumber: true, licenseJurisdiction: true, specialty: true, versions: { orderBy: { version: "asc" }, select: { version: true, title: true, content: true, changeReason: true, createdAt: true } } } },
        },
      },
      accessGrants: {
        select: {
          status: true,
          startsAt: true,
          expiresAt: true,
          revokedAt: true,
          doctor: { select: { firstName: true, lastName: true, doctorProfile: { select: { specialty: true, licenseNumber: true } } } },
          permissions: { select: { resourceType: true, resourceKey: true, action: true } },
        },
      },
    },
  });
  const activity = await db.auditEvent.findMany({
    where: { OR: [{ actorUserId: userId }, ...(patient ? [{ subjectPatientId: patient.id }] : [])] },
    orderBy: { seq: "desc" },
    take: 2000,
    select: { createdAt: true, action: true, outcome: true, actorType: true, resourceType: true, metadata: true },
  });

  const { id: _patientId, ...patientData } = patient ?? { id: null };
  void _patientId;
  return {
    exportedAt: new Date().toISOString(),
    format: "vitalia-personal-data-export/v1",
    account: user,
    patient: patient ? patientData : null,
    activity,
  };
}
