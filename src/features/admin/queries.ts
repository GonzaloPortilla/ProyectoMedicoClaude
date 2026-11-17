import "server-only";
import type { DoctorVerificationStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/**
 * Consultas de administración.
 *
 * MÍNIMO PRIVILEGIO: el administrador gestiona cuentas y verificaciones, pero NO accede
 * a información médica ni a datos personales de salud. Por eso todas las consultas usan
 * `select` explícito y nunca incluyen PatientProfile ni (en el futuro) historiales o estudios.
 * Cualquier campo nuevo debe agregarse acá de forma deliberada.
 */

const PAGE_SIZE = 25;

export async function getAdminStats() {
  const [users, patients, doctors, pending] = await Promise.all([
    db.user.count(),
    db.userRole.count({ where: { role: "PATIENT" } }),
    db.userRole.count({ where: { role: "DOCTOR" } }),
    db.doctorProfile.count({ where: { verificationStatus: "PENDING" } }),
  ]);
  return { users, patients, doctors, pending };
}

export async function listUsers({ query, role, page }: { query?: string; role?: Role; page: number }) {
  const q = query?.trim().slice(0, 100);
  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { roles: { some: { role } } } : {}),
  };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        roles: { select: { role: true } },
        doctorProfile: { select: { verificationStatus: true } },
      },
    }),
  ]);
  return { total, users, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function listDoctors(status: DoctorVerificationStatus | "ALL") {
  const where = status === "ALL" ? {} : { verificationStatus: status };
  const [doctors, counts] = await Promise.all([
    db.doctorProfile.findMany({
      where,
      orderBy: [{ createdAt: "asc" }],
      take: 200,
      select: {
        id: true,
        specialty: true,
        licenseNumber: true,
        jurisdiction: true,
        verificationStatus: true,
        verifiedAt: true,
        createdAt: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        verifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, note: true, createdAt: true, reviewer: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    db.doctorProfile.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
  ]);
  const byStatus = { PENDING: 0, VERIFIED: 0, REJECTED: 0 } as Record<DoctorVerificationStatus, number>;
  for (const c of counts) byStatus[c.verificationStatus] = c._count._all;
  return { doctors, counts: { ...byStatus, ALL: byStatus.PENDING + byStatus.VERIFIED + byStatus.REJECTED } };
}
