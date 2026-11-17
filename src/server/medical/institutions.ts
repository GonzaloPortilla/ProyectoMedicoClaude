import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeText } from "@/lib/text";

type Tx = Prisma.TransactionClient;

/** Devuelve la institución del paciente con ese nombre (sin distinguir acentos/mayúsculas), o la crea. */
export async function upsertInstitution(tx: Tx, patientId: string, name: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const clean = name?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const normalizedName = normalizeText(clean);
  return tx.institution.upsert({
    where: { patientId_normalizedName: { patientId, normalizedName } },
    create: { patientId, name: clean, normalizedName },
    update: {},
    select: { id: true, name: true },
  });
}
