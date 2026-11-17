import "server-only";
import { db } from "@/server/db";

/** Perfil profesional propio. El userId siempre proviene de la sesión. */
export async function getOwnDoctorProfile(userId: string) {
  return db.doctorProfile.findUnique({
    where: { userId },
    select: {
      specialty: true,
      licenseNumber: true,
      jurisdiction: true,
      verificationStatus: true,
      verifiedAt: true,
      createdAt: true,
      verifications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, note: true, createdAt: true },
      },
    },
  });
}
